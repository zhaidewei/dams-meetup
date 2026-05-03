import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import type { PostRow, PublicUserDisplay } from '@/lib/types'
import type { SectionId } from '@/lib/sections'

type AuthorMini = Pick<
  PublicUserDisplay,
  'nickname' | 'company' | 'contact_handle' | 'is_vip' | 'vip_name' | 'vip_title'
>

type ReplyAuthorMini = Pick<
  PublicUserDisplay,
  'nickname' | 'company' | 'is_vip' | 'vip_name' | 'vip_title'
>

export type MentionedUserMini = Pick<
  PublicUserDisplay,
  'id' | 'nickname' | 'is_vip' | 'vip_name'
>

// Public reply: written by a human, visible to everyone.
// AI reply: is_ai=true, visibility='author_only', author is null,
//           mentioned_user is the recommendation target.
export type FeedReply = {
  id: number
  user_id: string | null
  body: string
  created_at: string
  updated_at: string | null
  is_ai: boolean
  author: ReplyAuthorMini | null
  mentioned_user: MentionedUserMini | null
}

export type FeedPost = PostRow & {
  author: AuthorMini
  replies: FeedReply[]
  reply_count: number
  like_count: number
  liked_by_me: boolean
  // Poll-only fields (undefined for type='text')
  poll_total_votes?: number
  poll_option_counts?: Record<number, number>
  poll_my_vote_options?: number[]
}

export async function fetchFeed(
  viewerId: string,
  opts: { limit?: number; authorId?: string; section?: SectionId } = {},
): Promise<FeedPost[]> {
  const sb = getServerSupabase()
  const limit = opts.limit ?? 100

  let postsQuery = sb
    .from('posts')
    .select(
      `id, user_id, type, body, tags, show_contact, section,
       poll_options, poll_multi, poll_deadline, poll_hide_results,
       match_intent, created_at,
       author:users!user_id ( nickname, company, contact_handle, is_vip, vip_name, vip_title ),
       replies (
         id, user_id, body, created_at, updated_at, is_ai, visibility, mentioned_user_id,
         author:users!user_id ( nickname, company, is_vip, vip_name, vip_title ),
         mentioned_user:users!mentioned_user_id ( id, nickname, is_vip, vip_name )
       )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (opts.authorId) postsQuery = postsQuery.eq('user_id', opts.authorId)
  if (opts.section) postsQuery = postsQuery.eq('section', opts.section)

  const [postsRes, likesRes, votesRes] = await Promise.all([
    postsQuery,
    sb.from('likes').select('post_id, user_id'),
    sb.from('poll_votes').select('post_id, user_id, option_id'),
  ])

  if (postsRes.error) {
    console.error('fetchFeed posts error:', postsRes.error)
    return []
  }
  if (likesRes.error) {
    console.error('fetchFeed likes error:', likesRes.error)
  }
  if (votesRes.error) {
    console.error('fetchFeed poll_votes error:', votesRes.error)
  }

  const likeCounts = new Map<number, number>()
  const viewerLikes = new Set<number>()
  for (const l of likesRes.data ?? []) {
    const pid = l.post_id as number
    likeCounts.set(pid, (likeCounts.get(pid) ?? 0) + 1)
    if (l.user_id === viewerId) viewerLikes.add(pid)
  }

  // post_id → { option_id → count, total, myOptions[] }
  const pollAgg = new Map<
    number,
    { counts: Record<number, number>; total: number; mine: number[] }
  >()
  for (const v of votesRes.data ?? []) {
    const pid = v.post_id as number
    const oid = v.option_id as number
    let agg = pollAgg.get(pid)
    if (!agg) {
      agg = { counts: {}, total: 0, mine: [] }
      pollAgg.set(pid, agg)
    }
    agg.counts[oid] = (agg.counts[oid] ?? 0) + 1
    agg.total += 1
    if (v.user_id === viewerId) agg.mine.push(oid)
  }

  return (postsRes.data ?? []).map((row) => {
    const author = unnestRelation(row.author) as AuthorMini
    const repliesRaw = (row.replies ?? []) as Array<{
      id: number
      user_id: string | null
      body: string
      created_at: string
      updated_at: string | null
      is_ai: boolean
      visibility: 'public' | 'author_only'
      mentioned_user_id: string | null
      author: ReplyAuthorMini | ReplyAuthorMini[] | null
      mentioned_user: MentionedUserMini | MentionedUserMini[] | null
    }>
    const isPostAuthor = (row.user_id as string) === viewerId
    const replies: FeedReply[] = repliesRaw
      // F'' visibility filter: author_only replies are exposed only to post author.
      .filter((r) => r.visibility === 'public' || isPostAuthor)
      .map((r) => ({
        id: r.id,
        user_id: r.user_id,
        body: r.body,
        created_at: r.created_at,
        updated_at: r.updated_at,
        is_ai: r.is_ai,
        author: r.author ? (unnestRelation(r.author) as ReplyAuthorMini) : null,
        mentioned_user: r.mentioned_user
          ? (unnestRelation(r.mentioned_user) as MentionedUserMini)
          : null,
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const post: FeedPost = {
      ...row,
      author,
      replies,
      reply_count: replies.length,
      like_count: likeCounts.get(row.id as number) ?? 0,
      liked_by_me: viewerLikes.has(row.id as number),
    } as FeedPost
    if (row.type === 'poll') {
      const agg = pollAgg.get(row.id as number)
      post.poll_total_votes = agg?.total ?? 0
      post.poll_option_counts = agg?.counts ?? {}
      post.poll_my_vote_options = agg?.mine ?? []
    }
    return post
  })
}

function unnestRelation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value
}
