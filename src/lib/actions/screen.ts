'use server'

import { getServerSupabase } from '@/lib/supabase/server'
import { fetchFeed, type FeedPost } from '@/lib/queries/posts'
import { fetchQuestionsForHost, type ScreenQuestion } from '@/lib/queries/questions'
import { fetchLotteryDraw, type ScreenLotteryDraw } from '@/lib/queries/lottery'
import { getScreenModeState, type ScreenModeState } from '@/lib/queries/event-state'

// The screen has no viewer identity — using a zero UUID makes liked_by_me /
// poll_my_vote_options always false in fetchFeed (no row matches).
const SCREEN_VIEWER_ID = '00000000-0000-0000-0000-000000000000'
const ONLINE_WINDOW_MS = 5 * 60 * 1000

export type ScreenSnapshot = {
  posts: FeedPost[]
  questions: ScreenQuestion[]
  // 当前 host 已答的问题数；让大屏在 questions=[] 但有 answered 时显示
  // 「N 个问题都答完了」而非「还没有人提问」。
  questionsAnsweredCount: number
  lottery: ScreenLotteryDraw | null
  online: number
  mode: ScreenModeState
  serverNow: number
}

// fetchScreenData 不再接 section 参数（issue #45）：filter 已升级为 server state，
// 内部先拿 mode，再用 mode.screen_filter_section 喂给 fetchFeed。/admin 改 filter
// → event_state 写入 → Realtime broadcast → 所有 /screen tab 下次 refresh 拿新值。
export async function fetchScreenData(): Promise<ScreenSnapshot> {
  const sb = getServerSupabase()
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
  const mode = await getScreenModeState()
  const [posts, onlineRes] = await Promise.all([
    fetchFeed(SCREEN_VIEWER_ID, { limit: 50, section: mode.screen_filter_section ?? undefined }),
    sb
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_seen_at', cutoff),
  ])

  const [questions, answeredCountRes, lottery] = await Promise.all([
    mode.mode === 'qa' && mode.qa_host_user_id
      ? fetchQuestionsForHost(mode.qa_host_user_id)
      : Promise.resolve([] as ScreenQuestion[]),
    mode.mode === 'qa' && mode.qa_host_user_id
      ? sb
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'question')
          .eq('question_target_user_id', mode.qa_host_user_id)
          .not('answered_at', 'is', null)
      : Promise.resolve({ count: 0 } as { count: number | null }),
    mode.mode === 'lottery' && mode.lottery_draw_id
      ? fetchLotteryDraw(mode.lottery_draw_id)
      : Promise.resolve(null as ScreenLotteryDraw | null),
  ])

  return {
    posts,
    questions,
    questionsAnsweredCount: answeredCountRes.count ?? 0,
    lottery,
    online: onlineRes.count ?? 0,
    mode,
    serverNow: Date.now(),
  }
}
