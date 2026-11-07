import { INTERACTION_END, ADMISSION_END } from '../src/lib/meetup15/event'
import { requestCookie } from '../src/lib/meetup15/identity'
import { parseSummaryMetrics, readMeetupSummary } from '../src/lib/meetup15/summary'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import type { ActivityEnv } from './activity'

const headers = { 'Cache-Control': 'private, no-store' }

function result(status: string) {
  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: `/admin/activity?tab=summary&summary=${status}` },
  })
}

// 串行检查所确认的公开版本，并将清理、状态复位和完成记录放在同一事务。
async function cleanActivity(db: D1Database, revision: number, now: number) {
  const approved = `EXISTS (
    SELECT 1 FROM meetup15_summary WHERE id = 1 AND revision = ? AND cleaned_at IS NULL
  )`
  const tables = [
    'meetup15_dm_threads',
    'meetup15_raffles',
    'meetup15_discussion',
    'meetup15_qa_rounds',
    'meetup15_polls',
    'meetup15_members',
  ]
  const changes = await db.batch([
    db.prepare(`
      INSERT INTO activity_state (id) SELECT 1 WHERE ${approved}
      ON CONFLICT(id) DO UPDATE SET
        admission_open = 0, revision = revision + (admission_open <> 0), section_override = NULL,
        projection_mode = 'hidden', projection_round_id = NULL, projection_raffle_id = NULL,
        projection_revision = projection_revision + 1,
        screen_mode = 'live', screen_poll_section = NULL, reveal_poll_id = NULL, screen_lottery = NULL
    `).bind(revision),
    ...tables.map(table => db.prepare(`DELETE FROM ${table} WHERE ${approved}`).bind(revision)),
    db.prepare(`
      UPDATE meetup15_summary SET cleaned_at = ? WHERE id = 1 AND revision = ? AND cleaned_at IS NULL
    `).bind(now, revision),
  ])
  return changes.at(-1)?.meta.changes === 1
}

export async function handleMeetupSummary(request: Request, env: ActivityEnv, now = Date.now()) {
  if (verifySessionCookie(ACTIVITY_ADMIN_COOKIE, requestCookie(request, ACTIVITY_ADMIN_COOKIE), env.SESSION_SECRET) !== '1') {
    return new Response(null, { status: 401, headers })
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers })
  if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response(null, { status: 403, headers })

  const form = await request.formData().catch(() => null)
  const db = env.ACTIVITY_DB
  if (form?.get('action') === 'publish') {
    if (now < ADMISSION_END) return result('early')
    const file = form.get('summary')
    if (!(file instanceof File) || file.size < 1 || file.size > 4096) return result('invalid')
    let metrics
    try {
      metrics = parseSummaryMetrics(JSON.parse(await file.text()))
    } catch {
      return result('invalid')
    }
    if (!metrics) return result('invalid')
    await db.prepare(`
      INSERT INTO meetup15_summary (id, metrics, published_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET metrics = excluded.metrics, published_at = excluded.published_at,
        revision = meetup15_summary.revision + 1
    `).bind(JSON.stringify(metrics), now).run()
    return result('published')
  }

  if (form?.get('action') !== 'cleanup') return result('invalid')
  if (now < INTERACTION_END) return result('early')
  const revision = Number(form.get('revision'))
  if (form.get('archived') !== 'yes' || !Number.isSafeInteger(revision) || revision < 1) return result('confirm')
  if (!await cleanActivity(db, revision, now)) {
    const summary = await readMeetupSummary(db)
    return result(summary?.cleanedAt != null ? 'cleaned' : 'changed')
  }
  await Promise.allSettled([
    env.ACTIVITY_UPDATES.getByName('meetup-15').publish(),
    env.ACTIVITY_UPDATES.getByName('meetup-15-discussion').publish('screen.updated'),
  ])
  return result('cleaned')
}
