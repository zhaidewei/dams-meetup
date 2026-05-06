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

  // like_count 由 0020 trigger 维护到 posts 列上，单 query 拿全部数据。
  const postsRes = await sb
    .from('posts')
    .select(
      `id, user_id, body, created_at, like_count,
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

  const items: ScreenQuestion[] = postsRes.data.map((row) => {
    const a = row.author as QuestionAuthor | QuestionAuthor[] | null
    const author = Array.isArray(a) ? a[0] : (a as QuestionAuthor)
    return {
      id: row.id as number,
      user_id: row.user_id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      like_count: (row.like_count as number) ?? 0,
      author,
    }
  })

  items.sort((a, b) => {
    if (b.like_count !== a.like_count) return b.like_count - a.like_count
    return b.created_at.localeCompare(a.created_at)
  })
  return items.slice(0, limit)
}
