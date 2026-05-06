import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import type { PostRow, PublicUserDisplay } from '@/lib/types'
import type { SectionId } from '@/lib/sections'

type AuthorMini = Pick<
  PublicUserDisplay,
  'nickname' | 'company' | 'contact_handle' | 'show_contact' | 'is_vip' | 'vip_name' | 'vip_title'
>

type ReplyAuthorMini = Pick<
  PublicUserDisplay,
  'nickname' | 'company' | 'contact_handle' | 'show_contact' | 'is_vip' | 'vip_name' | 'vip_title'
>

// UserCard 渲染所需的全部字段（id + 显示名 + meta + 联系方式）。
// AiReplyRow 把 mentioned_user 包成 UserCardTrigger，所以必须 select 全。
export type MentionedUserMini = Pick<
  PublicUserDisplay,
  'id' | 'nickname' | 'company' | 'contact_handle' | 'show_contact' | 'is_vip' | 'vip_name' | 'vip_title'
>

// Public reply: written by a human, visible to everyone.
// AI reply: is_ai=true, visibility='author_only', author is null,
//           mentioned_user is the recommendation target.
export type FeedReply = {
  id: number
  user_id: string | null
  parent_reply_id: number | null
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
  // Author-only: the match_intent text the post author privately filled.
  // Populated only when row.user_id === viewerId (see mapping below) so it
  // never reaches a non-author client.
  match_intent?: string | null
}

export async function fetchFeed(
  viewerId: string,
  opts: {
    limit?: number
    authorId?: string
    section?: SectionId
    // QA: 拉某 host 的全部 question 帖（绕过 section filter）。
    questionTargetUserId?: string
    // Cursor 分页：只拿 created_at 严格早于此 ISO timestamp 的帖。
    // 配合 limit 实现下拉加载历史；不传则取最新 N 条。
    before?: string
  } = {},
): Promise<FeedPost[]> {
  const sb = getServerSupabase()
  const limit = opts.limit ?? 100

  let postsQuery = sb
    .from('posts')
    .select(
      `id, user_id, type, body, tags, show_contact, section,
       poll_options, poll_multi, poll_deadline, poll_hide_results,
       question_target_user_id, answered_at,
       created_at,
       author:users!user_id ( nickname, company, contact_handle, show_contact, is_vip, vip_name, vip_title ),
       replies (
         id, user_id, parent_reply_id, body, created_at, updated_at, is_ai, visibility, mentioned_user_id,
         author:users!user_id ( nickname, company, contact_handle, show_contact, is_vip, vip_name, vip_title ),
         mentioned_user:users!mentioned_user_id ( id, nickname, company, contact_handle, show_contact, is_vip, vip_name, vip_title )
       )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (opts.before) postsQuery = postsQuery.lt('created_at', opts.before)
  if (opts.authorId) postsQuery = postsQuery.eq('user_id', opts.authorId)
  if (opts.questionTargetUserId) {
    // QA 模式：只要这个 host 的 question 帖。section/type 都不限。
    postsQuery = postsQuery
      .eq('type', 'question')
      .eq('question_target_user_id', opts.questionTargetUserId)
  } else {
    // 常规 timeline / /me：question 帖走独立区块（/feed 的 QA 区），不进 section feed。
    postsQuery = postsQuery.in('type', ['text', 'poll'])
    if (opts.section) postsQuery = postsQuery.eq('section', opts.section)
  }

  // Two-step fetch: posts first to learn which IDs we need, then aggregates
  // scoped by IN (post_ids). Earlier version did one parallel fetch that pulled
  // ALL rows from likes / poll_votes — under Realtime broadcast amplification
  // (every write triggers every connected client to re-render the feed), this
  // grew quadratically with activity and dominated p95 even at 50 users.
  const postsRes = await postsQuery
  if (postsRes.error) {
    console.error('fetchFeed posts error:', postsRes.error)
    return []
  }
  const postRows = postsRes.data ?? []
  const postIds = postRows.map((r) => r.id as number)
  const pollIds = postRows.filter((r) => r.type === 'poll').map((r) => r.id as number)
  const myPostIds = postRows.filter((r) => r.user_id === viewerId).map((r) => r.id as number)

  const empty = { data: [] as never[], error: null }
  const [likesRes, votesRes, intentRes] = await Promise.all([
    postIds.length
      ? sb.from('likes').select('post_id, user_id').in('post_id', postIds)
      : empty,
    pollIds.length
      ? sb.from('poll_votes').select('post_id, user_id, option_id').in('post_id', pollIds)
      : empty,
    myPostIds.length
      ? sb.from('post_match_intents').select('post_id, intent').in('post_id', myPostIds)
      : empty,
  ])

  if (likesRes.error) console.error('fetchFeed likes error:', likesRes.error)
  if (votesRes.error) console.error('fetchFeed poll_votes error:', votesRes.error)
  if (intentRes.error) console.error('fetchFeed match_intent error:', intentRes.error)

  const intentByPost = new Map<number, string>()
  for (const row of intentRes.data ?? []) {
    intentByPost.set(row.post_id as number, row.intent as string)
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
      parent_reply_id: number | null
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
        parent_reply_id: r.parent_reply_id,
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
      match_intent: isPostAuthor ? (intentByPost.get(row.id as number) ?? null) : null,
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
