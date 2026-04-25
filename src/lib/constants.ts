export const EVENT_NAME = process.env.NEXT_PUBLIC_EVENT_NAME ?? '荷兰华人数据群 Meetup 第14期'
export const EVENT_ORGANIZER = process.env.NEXT_PUBLIC_EVENT_ORGANIZER ?? 'DAMS'
export const EVENT_START_ISO = process.env.NEXT_PUBLIC_EVENT_START ?? '2026-05-09T12:45:00+02:00'
export const EVENT_END_ISO = process.env.NEXT_PUBLIC_EVENT_END ?? '2026-05-09T18:00:00+02:00'

export const POST_MAX_CHARS = 300
export const REPLY_MAX_CHARS = 300
export const POLL_MAX_OPTIONS = 6
export const POLL_MIN_OPTIONS = 2
export const MATCH_INTENT_MAX_CHARS = 200

export const RECOVERY_WINDOW_DAYS = 7

// Cookie expiry: end of event + 7 days post-event window
export function cookieExpiresAt(): Date {
  return new Date(Date.parse(EVENT_END_ISO) + RECOVERY_WINDOW_DAYS * 86_400_000)
}
