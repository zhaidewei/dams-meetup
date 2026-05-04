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
  post_section: string | null
  replier: ReplierMini
}

export async function fetchRepliesToMe(myUserId: string): Promise<ReplyToMe[]> {
  const sb = getServerSupabase()

  const myPosts = await sb.from('posts').select('id, body, section').eq('user_id', myUserId)
  if (myPosts.error) {
    console.error('fetchRepliesToMe my posts error:', myPosts.error)
    return []
  }
  const postIds = (myPosts.data ?? []).map((r) => r.id as number)
  if (postIds.length === 0) return []

  const postById = new Map<number, { body: string; section: string | null }>(
    (myPosts.data ?? []).map((r) => [
      r.id as number,
      { body: r.body as string, section: (r.section as string | null) ?? null },
    ]),
  )

  const { data, error } = await sb
    .from('replies')
    .select(
      `id, body, created_at, post_id,
       replier:users!user_id ( nickname, company, is_vip, vip_name, vip_title )`,
    )
    .in('post_id', postIds)
    .neq('user_id', myUserId)
    .eq('is_ai', false) // F'' AI replies 走自己的弹层（feed 里的 AiReplyRow），不进"收到的回复"
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('fetchRepliesToMe replies error:', error)
    return []
  }

  return (data ?? []).map((row) => {
    const post = postById.get(row.post_id as number)
    return {
      id: row.id as number,
      body: row.body as string,
      created_at: row.created_at as string,
      post_id: row.post_id as number,
      post_body: post?.body ?? '',
      post_section: post?.section ?? null,
      replier: unnestRelation(row.replier) as ReplierMini,
    }
  })
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

