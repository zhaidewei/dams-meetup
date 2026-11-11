import type { D1Database } from '@cloudflare/workers-types'
import type { LiveStats } from '../src/lib/meetup15/live-stats'

export async function readLiveStats(db: D1Database, now: number) {
  const counts = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM meetup15_members WHERE role = 'attendee') AS attendees,
      (SELECT COUNT(*) FROM meetup15_members WHERE role = 'attendee' AND last_seen_at >= ?) AS recentAttendees,
      (SELECT COUNT(*) FROM meetup15_members WHERE role = 'guest') AS guests,
      (SELECT COUNT(*) FROM meetup15_discussion WHERE kind = 'post') AS posts,
      (SELECT COUNT(*) FROM meetup15_discussion WHERE kind = 'reply') AS replies,
      (SELECT COUNT(*) FROM meetup15_discussion WHERE kind = 'question') AS questions,
      (SELECT COUNT(*) FROM meetup15_discussion_likes) AS likes,
      (SELECT COUNT(*) FROM meetup15_reply_reactions) AS reactions,
      (SELECT COUNT(*) FROM meetup15_raffles WHERE finished_at IS NOT NULL) AS raffleRounds
  `).bind(Math.floor(now / 1000) - 300).first<LiveStats>()
  return { counts, updatedAt: now, refreshAt: null }
}
