export const EVENT_NAME = process.env.NEXT_PUBLIC_EVENT_NAME ?? '荷兰华人数据群 Meetup 第14期'
export const EVENT_ORGANIZER = process.env.NEXT_PUBLIC_EVENT_ORGANIZER ?? 'DAMS'
export const EVENT_START_ISO = process.env.NEXT_PUBLIC_EVENT_START ?? '2026-05-09T12:45:00+02:00'
export const EVENT_END_ISO = process.env.NEXT_PUBLIC_EVENT_END ?? '2026-05-09T18:00:00+02:00'

export const POST_MAX_CHARS = 300
export const REPLY_MAX_CHARS = 300
export const DM_MAX_CHARS = 300
export const POLL_MAX_OPTIONS = 6
export const POLL_MIN_OPTIONS = 2
export const MATCH_INTENT_MAX_CHARS = 200

export const RECOVERY_WINDOW_DAYS = 7

// 系统通知 user 的 contact_handle（migration 0022 插入）。中奖私信
// 由 resolveLotteryAction 以这个 user 名义发出，复用 DM fan-out。
export const LOTTERY_NOTIFY_HANDLE = 'SYSTEM-LOTTERY'

// Cookie expiry: end of event + 7 days post-event window
export function cookieExpiresAt(): Date {
  return new Date(Date.parse(EVENT_END_ISO) + RECOVERY_WINDOW_DAYS * 86_400_000)
}

export type EventPhase = 'pre' | 'live' | 'post' | 'cleanup'

// 活动四阶段（与 supabase/migrations/0025_match_cron_phased.sql 对齐）：
// pre:     now < start            → 距开场，AI 撮合每小时
// live:    start ≤ now < end      → 距结束，AI 撮合每 10 分钟
// post:    end ≤ now < cleanup    → 距清理，AI 撮合每天
// cleanup: now ≥ cleanup          → 7 天窗口已过，撮合 cron 不再触发
export function getEventPhase(now: number = Date.now()): EventPhase {
  const start = Date.parse(EVENT_START_ISO)
  const end = Date.parse(EVENT_END_ISO)
  const cleanup = end + RECOVERY_WINDOW_DAYS * 86_400_000
  if (now < start) return 'pre'
  if (now < end) return 'live'
  if (now < cleanup) return 'post'
  return 'cleanup'
}
