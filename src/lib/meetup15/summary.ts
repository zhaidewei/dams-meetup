export const LATEST_SUMMARY_PATH = '/summary/15'

export const SUMMARY_METRICS = {
  attendees: '参与人数',
  posts: '发帖数',
  replies: '回复数',
  questions: '提问数',
  raffleRounds: '抽奖轮次',
} as const

export type SummaryMetrics = Partial<Record<keyof typeof SUMMARY_METRICS, number>>

export function parseSummaryMetrics(value: unknown): SummaryMetrics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (!entries.length || entries.some(([key, count]) =>
    !Object.hasOwn(SUMMARY_METRICS, key) || !Number.isSafeInteger(count) || count < 0)) return null
  return Object.fromEntries(entries)
}

export function readMeetupSummary(db: D1Database) {
  return db.prepare(`
    SELECT metrics, revision, cleaned_at AS cleanedAt FROM meetup15_summary WHERE id = 1
  `).first<{ metrics: string; revision: number; cleanedAt: number | null }>()
}
