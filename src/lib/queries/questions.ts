import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import type { PublicUserDisplay } from '@/lib/types'

type QuestionAuthor = Pick<
  PublicUserDisplay,
  'nickname' | 'company' | 'is_vip' | 'vip_name' | 'vip_title'
>

export type ScreenQuestion = {
  id: number
  user_id: string
  body: string
  created_at: string
  like_count: number
  author: QuestionAuthor
}

// 给 /screen QA 模式使用：拉所有提问给该 host 的 question post，按 like 降序、
// 同 like 时按时间降序。limit 13（顶 5 大字号 + 8 ticker）。
export async function fetchQuestionsForHost(
  hostUserId: string,
  limit = 13,
): Promise<ScreenQuestion[]> {
  const sb = getServerSupabase()

  // 先拿 posts（按时间倒序限 100 防爆），再按 IN (post_ids) 聚合 likes。
  // 早期版本对 likes 全表扫，会被 Realtime 写入的高广播率打爆 DB。
  const postsRes = await sb
    .from('posts')
    .select(
      `id, user_id, body, created_at,
       author:users!user_id ( nickname, company, is_vip, vip_name, vip_title )`,
    )
    .eq('type', 'question')
    .eq('question_target_user_id', hostUserId)
    .is('answered_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (postsRes.error || !postsRes.data) {
    if (postsRes.error) console.error('fetchQuestionsForHost posts error:', postsRes.error)
    return []
  }

  const postIds = postsRes.data.map((r) => r.id as number)
  const likesRes = postIds.length
    ? await sb.from('likes').select('post_id').in('post_id', postIds)
    : { data: [] as Array<{ post_id: number }>, error: null }

  const likeCounts = new Map<number, number>()
  for (const l of likesRes.data ?? []) {
    const pid = l.post_id as number
    likeCounts.set(pid, (likeCounts.get(pid) ?? 0) + 1)
  }

  const items: ScreenQuestion[] = postsRes.data.map((row) => {
    const a = row.author as QuestionAuthor | QuestionAuthor[] | null
    const author = Array.isArray(a) ? a[0] : (a as QuestionAuthor)
    return {
      id: row.id as number,
      user_id: row.user_id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      like_count: likeCounts.get(row.id as number) ?? 0,
      author,
    }
  })

  items.sort((a, b) => {
    if (b.like_count !== a.like_count) return b.like_count - a.like_count
    return b.created_at.localeCompare(a.created_at)
  })
  return items.slice(0, limit)
}
