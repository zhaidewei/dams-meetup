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

  // 一次查询：把 likes/poll_votes/post_match_intents 一起 embed 进 posts，
  // 让 PostgREST 在 PG 层做 lateral join，省掉之前 await postsQuery →
  // Promise.all([likes, votes, intents]) 的第二个 RTT。viewer 的 likes 用
  // embedded filter (.eq likes.user_id) 限制；poll_votes 取全部用于聚合；
  // post_match_intents 拉全部，map 阶段按 isPostAuthor 过滤后才 attach 到
  // 返回对象，安全语义不变。
  let postsQuery = sb
    .from('posts')
    .select(
      `id, user_id, type, body, tags, show_contact, section,
       poll_options, poll_multi, poll_deadline, poll_hide_results,
       question_target_user_id, answered_at,
       created_at, like_count,
       author:users!user_id ( nickname, company, contact_handle, show_contact, is_vip, vip_name, vip_title ),
       replies (
         id, user_id, parent_reply_id, body, created_at, updated_at, is_ai, visibility, mentioned_user_id,
         author:users!user_id ( nickname, company, contact_handle, show_contact, is_vip, vip_name, vip_title ),
         mentioned_user:users!mentioned_user_id ( id, nickname, company, contact_handle, show_contact, is_vip, vip_name, vip_title )
       ),
       likes ( user_id ),
       poll_votes ( user_id, option_id ),
       post_match_intents ( intent )`,
    )
    .eq('likes.user_id', viewerId)
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

  const postsRes = await postsQuery
  if (postsRes.error) {
    console.error('fetchFeed posts error:', postsRes.error)
    return []
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
    // embedded likes 已经被 .eq('likes.user_id', viewerId) 过滤成只剩 viewer 自己；
    // 任意行存在 = liked_by_me。
    const likedByMe = ((row.likes as Array<{ user_id: string }> | null) ?? []).length > 0
    // post_match_intents 在表层有 unique(post_id) 约束 → PostgREST 把它当 1:1
    // 关系返回单对象（不是数组），没有时为 null。Supabase JS 类型推断不知道 1:1
    // 优化所以默认推成数组，运行时验证过实际形态是单对象（scripts/verify-embed.mjs）。
    // 最终 attach 受 isPostAuthor 控制，跟改造前的 intentByPost.get(...) 语义一致。
    const intentRow = row.post_match_intents as unknown as { intent: string } | null
    const post: FeedPost = {
      ...row,
      author,
      replies,
      reply_count: replies.length,
      // posts.like_count 由 0020 trigger 在 likes INSERT/DELETE 时维护
      like_count: (row.like_count as number) ?? 0,
      liked_by_me: likedByMe,
      match_intent: isPostAuthor ? (intentRow?.intent ?? null) : null,
    } as FeedPost
    if (row.type === 'poll') {
      const votes = (row.poll_votes as Array<{ user_id: string; option_id: number }> | null) ?? []
      const counts: Record<number, number> = {}
      const mine: number[] = []
      for (const v of votes) {
        counts[v.option_id] = (counts[v.option_id] ?? 0) + 1
        if (v.user_id === viewerId) mine.push(v.option_id)
      }
      post.poll_total_votes = votes.length
      post.poll_option_counts = counts
      post.poll_my_vote_options = mine
    }
    return post
  })
}

function unnestRelation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value
}
