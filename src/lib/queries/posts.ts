import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import type { PostRow, PublicUserDisplay } from '@/lib/types'

type AuthorMini = Pick<
  PublicUserDisplay,
  'nickname' | 'company' | 'contact_handle' | 'is_vip' | 'vip_name' | 'vip_title'
>

type ReplyAuthorMini = Pick<
  PublicUserDisplay,
  'nickname' | 'company' | 'is_vip' | 'vip_name' | 'vip_title'
>

export type FeedReply = {
  id: number
  body: string
  created_at: string
  author: ReplyAuthorMini
}

export type FeedPost = PostRow & {
  author: AuthorMini
  replies: FeedReply[]
  reply_count: number
  like_count: number
  liked_by_me: boolean
}

export async function fetchFeed(
  viewerId: string,
  opts: { limit?: number; authorId?: string } = {},
): Promise<FeedPost[]> {
  const sb = getServerSupabase()
  const limit = opts.limit ?? 100

  let postsQuery = sb
    .from('posts')
    .select(
      `id, user_id, type, body, tags, show_contact,
       poll_options, poll_multi, poll_deadline, poll_hide_results,
       created_at,
       author:users!user_id ( nickname, company, contact_handle, is_vip, vip_name, vip_title ),
       replies (
         id, body, created_at,
         author:users!user_id ( nickname, company, is_vip, vip_name, vip_title )
       )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (opts.authorId) postsQuery = postsQuery.eq('user_id', opts.authorId)

  const [postsRes, likesRes] = await Promise.all([
    postsQuery,
    sb.from('likes').select('post_id, user_id'),
  ])

  if (postsRes.error) {
    console.error('fetchFeed posts error:', postsRes.error)
    return []
  }
  if (likesRes.error) {
    console.error('fetchFeed likes error:', likesRes.error)
  }

  const likeCounts = new Map<number, number>()
  const viewerLikes = new Set<number>()
  for (const l of likesRes.data ?? []) {
    const pid = l.post_id as number
    likeCounts.set(pid, (likeCounts.get(pid) ?? 0) + 1)
    if (l.user_id === viewerId) viewerLikes.add(pid)
  }

  return (postsRes.data ?? []).map((row) => {
    const author = unnestRelation(row.author) as AuthorMini
    const repliesRaw = (row.replies ?? []) as Array<{
      id: number
      body: string
      created_at: string
      author: ReplyAuthorMini | ReplyAuthorMini[]
    }>
    const replies: FeedReply[] = repliesRaw
      .map((r) => ({
        id: r.id,
        body: r.body,
        created_at: r.created_at,
        author: unnestRelation(r.author) as ReplyAuthorMini,
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    return {
      ...row,
      author,
      replies,
      reply_count: replies.length,
      like_count: likeCounts.get(row.id as number) ?? 0,
      liked_by_me: viewerLikes.has(row.id as number),
    } as FeedPost
  })
}

function unnestRelation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value
}
