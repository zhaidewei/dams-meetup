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
  answered_at: string | null
  author: QuestionAuthor
}

// 给 /screen QA 模式使用：拉所有提问给该 host 的 question post，按 like 降序、
// 同 like 时按时间降序。limit 13（顶 5 大字号 + 8 ticker）。
// includeAnswered=true 给 /admin 控制台用 — 主办方需要看到已答 / 未答全集，
// 已答行渲染撤销按钮。/screen 默认只看未答，避免投影把已答塞回大屏。
export async function fetchQuestionsForHost(
  hostUserId: string,
  limit = 13,
  opts: { includeAnswered?: boolean } = {},
): Promise<ScreenQuestion[]> {
  const sb = getServerSupabase()

  let q = sb
    .from('posts')
    .select(
      `id, user_id, body, created_at, like_count, answered_at,
       author:users!user_id ( nickname, company, is_vip, vip_name, vip_title )`,
    )
    .eq('type', 'question')
    .eq('question_target_user_id', hostUserId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (!opts.includeAnswered) q = q.is('answered_at', null)
  const postsRes = await q

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
      answered_at: (row.answered_at as string | null) ?? null,
      author,
    }
  })

  items.sort((a, b) => {
    // admin 视角下未答优先；/screen 不会拿到 answered，这两条排序对外行为一致。
    const aDone = a.answered_at ? 1 : 0
    const bDone = b.answered_at ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    if (b.like_count !== a.like_count) return b.like_count - a.like_count
    return b.created_at.localeCompare(a.created_at)
  })
  return items.slice(0, limit)
}
