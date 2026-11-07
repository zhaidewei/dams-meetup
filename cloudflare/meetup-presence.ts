import type { D1Database } from '@cloudflare/workers-types'

export function touchMember(db: D1Database, id: string, now = Date.now()) {
  const seenAt = Math.floor(now / 1000)
  return db.prepare('UPDATE meetup15_members SET last_seen_at = ? WHERE id = ? AND COALESCE(last_seen_at, 0) <= ?')
    .bind(seenAt, id, seenAt - 30).run()
}
