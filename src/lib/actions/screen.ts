'use server'

import { getServerSupabase } from '@/lib/supabase/server'
import { fetchFeed, type FeedPost } from '@/lib/queries/posts'
import { fetchQuestionsForHost, type ScreenQuestion } from '@/lib/queries/questions'
import { fetchLotteryDraw, type ScreenLotteryDraw } from '@/lib/queries/lottery'
import { getScreenModeState, type ScreenModeState } from '@/lib/queries/event-state'
import { isSectionId, type SectionId } from '@/lib/sections'

// The screen has no viewer identity — using a zero UUID makes liked_by_me /
// poll_my_vote_options always false in fetchFeed (no row matches).
const SCREEN_VIEWER_ID = '00000000-0000-0000-0000-000000000000'
const ONLINE_WINDOW_MS = 5 * 60 * 1000

export type ScreenSnapshot = {
  posts: FeedPost[]
  questions: ScreenQuestion[]
  lottery: ScreenLotteryDraw | null
  online: number
  mode: ScreenModeState
  serverNow: number
}

export async function fetchScreenData(section?: string | null): Promise<ScreenSnapshot> {
  const sb = getServerSupabase()
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
  const sectionFilter: SectionId | undefined = isSectionId(section) ? section : undefined
  const [posts, onlineRes, mode] = await Promise.all([
    fetchFeed(SCREEN_VIEWER_ID, { limit: 50, section: sectionFilter }),
    sb
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_seen_at', cutoff),
    getScreenModeState(),
  ])

  const [questions, lottery] = await Promise.all([
    mode.mode === 'qa' && mode.qa_host_user_id
      ? fetchQuestionsForHost(mode.qa_host_user_id)
      : Promise.resolve([] as ScreenQuestion[]),
    mode.mode === 'lottery' && mode.lottery_draw_id
      ? fetchLotteryDraw(mode.lottery_draw_id)
      : Promise.resolve(null as ScreenLotteryDraw | null),
  ])

  return {
    posts,
    questions,
    lottery,
    online: onlineRes.count ?? 0,
    mode,
    serverNow: Date.now(),
  }
}
