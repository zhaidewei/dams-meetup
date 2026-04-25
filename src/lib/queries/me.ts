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
