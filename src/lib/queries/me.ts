import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import type { PublicUserDisplay } from '@/lib/types'

type ReplierMini = Pick<
  PublicUserDisplay,
  'nickname' | 'company' | 'is_vip' | 'vip_name' | 'vip_title'
>

export type ReplyToMe = {
  id: number
  body: string
  created_at: string
  post_id: number
  post_body: string
  replier: ReplierMini
}

// AI 撮合提到我：只暴露关联帖子摘要 + 时间，不暴露 reply.body 或对方 match_intent。
// 见 docs/matching-design.md §3 方案 F'' 双向通知设计。
export type MentionOfMe = {
  reply_id: number
  reply_created_at: string
  post_id: number
  post_body: string
}

export async function fetchMentionsOfMe(myUserId: string): Promise<MentionOfMe[]> {
  const sb = getServerSupabase()

  const { data, error } = await sb
    .from('replies')
    .select(`id, created_at, post_id, post:posts!post_id ( body )`)
    .eq('is_ai', true)
    .eq('mentioned_user_id', myUserId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('fetchMentionsOfMe error:', error)
    return []
  }

  return (data ?? []).map((row) => {
    const post = unnestRelation(row.post as { body: string } | { body: string }[] | null)
    return {
      reply_id: row.id as number,
      reply_created_at: row.created_at as string,
      post_id: row.post_id as number,
      post_body: post?.body ?? '',
    }
  })
}

export async function fetchRepliesToMe(myUserId: string): Promise<ReplyToMe[]> {
  const sb = getServerSupabase()

  const myPosts = await sb.from('posts').select('id, body').eq('user_id', myUserId)
  if (myPosts.error) {
    console.error('fetchRepliesToMe my posts error:', myPosts.error)
    return []
  }
  const postIds = (myPosts.data ?? []).map((r) => r.id as number)
  if (postIds.length === 0) return []

  const postBodyById = new Map<number, string>(
    (myPosts.data ?? []).map((r) => [r.id as number, r.body as string]),
  )

  const { data, error } = await sb
    .from('replies')
    .select(
      `id, body, created_at, post_id,
       replier:users!user_id ( nickname, company, is_vip, vip_name, vip_title )`,
    )
    .in('post_id', postIds)
    .neq('user_id', myUserId)
    .eq('is_ai', false) // F'' AI replies 不出现在"收到的回复"，单独走"有人想找你"
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('fetchRepliesToMe replies error:', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id as number,
    body: row.body as string,
    created_at: row.created_at as string,
    post_id: row.post_id as number,
    post_body: postBodyById.get(row.post_id as number) ?? '',
    replier: unnestRelation(row.replier) as ReplierMini,
  }))
}

function unnestRelation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value
}

// 未读回复 = 我帖子下、别人发的、is_ai=false、created_at > last_seen_me_at 的 reply 数。
export async function fetchUnreadRepliesCount(
  myUserId: string,
  lastSeenMeAt: string,
): Promise<number> {
  const sb = getServerSupabase()
  const myPosts = await sb.from('posts').select('id').eq('user_id', myUserId)
  const postIds = (myPosts.data ?? []).map((r) => r.id as number)
  if (postIds.length === 0) return 0
  const { count } = await sb
    .from('replies')
    .select('id', { count: 'exact', head: true })
    .in('post_id', postIds)
    .neq('user_id', myUserId)
    .eq('is_ai', false)
    .gt('created_at', lastSeenMeAt)
  return count ?? 0
}

// 未读 AI 提及 = is_ai=true 且 mentioned_user_id 是我，且 created_at > last_seen_me_at。
export async function fetchUnreadMentionsCount(
  myUserId: string,
  lastSeenMeAt: string,
): Promise<number> {
  const sb = getServerSupabase()
  const { count } = await sb
    .from('replies')
    .select('id', { count: 'exact', head: true })
    .eq('is_ai', true)
    .eq('mentioned_user_id', myUserId)
    .gt('created_at', lastSeenMeAt)
  return count ?? 0
}
