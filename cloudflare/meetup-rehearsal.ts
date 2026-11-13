import { REHEARSAL_END } from '../src/lib/meetup15/event'
import { requestCookie } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import { rehearsalFixtures } from './rehearsal-fixtures'
import type { ActivityEnv } from './activity'

const headers = { 'Cache-Control': 'private, no-store' }
const dataTables = [
  'meetup15_dm_threads', 'meetup15_raffles', 'meetup15_discussion', 'meetup15_qa_rounds', 'meetup15_polls',
]

const resetActivity = `
  UPDATE activity_state SET admission_open = 0, revision = revision + 1,
    section_override = ?, agenda_start_override = NULL, projection_mode = 'hidden', projection_round_id = NULL,
    projection_raffle_id = NULL, projection_slide = 0, projection_revision = projection_revision + 1,
    screen_mode = 'live', screen_poll_section = NULL, reveal_poll_id = NULL, screen_lottery = NULL
  WHERE id = 1`

async function clearRehearsal(db: D1Database, revision: number) {
  const current = 'EXISTS (SELECT 1 FROM activity_state WHERE id = 1 AND revision = ?)'
  const results = await db.batch([
    ...dataTables.map(table => db.prepare(`DELETE FROM ${table} WHERE ${current}`).bind(revision)),
    db.prepare(`DELETE FROM meetup15_members WHERE role = 'attendee' AND ${current}`).bind(revision),
    db.prepare(`${resetActivity} AND revision = ?`).bind(null, revision),
  ])
  return results.at(-1)?.meta.changes === 1
}

async function fillRehearsal(db: D1Database, revision: number, now: number) {
  const timestamp = Math.floor(now / 1000)
  const { members, posts, replies, questions, likes, candidates } = rehearsalFixtures(timestamp)
  const [first, ...others] = members
  const fixture = 'EXISTS (SELECT 1 FROM meetup15_members WHERE id = ?)'
  const results = await db.batch([
    // 此次操作的随机观众 ID 也用来标识是否成功取得填充资格。并发请求只有一个能写入。
    db.prepare(`
      INSERT INTO meetup15_members (id, role, display_name, last_seen_at)
      SELECT ?, 'attendee', ?, ?
      WHERE EXISTS (SELECT 1 FROM activity_state WHERE id = 1 AND revision = ?)
        AND NOT EXISTS (SELECT 1 FROM meetup15_members WHERE role = 'attendee')
        AND EXISTS (SELECT 1 FROM meetup15_members WHERE role = 'guest')
        ${dataTables.map(table => `AND NOT EXISTS (SELECT 1 FROM ${table})`).join(' ')}
    `).bind(first.id, first.name, first.lastSeen, revision),
    db.prepare(`
      INSERT INTO meetup15_members (id, role, display_name, last_seen_at)
      SELECT value->>'id', 'attendee', value->>'name', value->>'lastSeen'
      FROM json_each(?) WHERE ${fixture}
    `).bind(JSON.stringify(others), first.id),
    db.prepare(`
      INSERT INTO meetup15_discussion (kind, author_id, section, body, tags, created_at)
      SELECT 'post', value->>'author', value->>'section', value->>'body', '["彩排"]', value->>'createdAt'
      FROM json_each(?) WHERE ${fixture}
    `).bind(JSON.stringify(posts), first.id),
    db.prepare(`
      INSERT INTO meetup15_discussion (kind, author_id, section, body, post_id, created_at)
      SELECT 'reply', value->>'author', p.section, value->>'body', p.id, value->>'createdAt'
      FROM json_each(?) JOIN meetup15_discussion p ON p.author_id = value->>'target' AND p.kind = 'post'
      WHERE ${fixture}
    `).bind(JSON.stringify(replies), first.id),
    db.prepare(`
      INSERT INTO meetup15_qa_rounds (guest_id, section, opened_at)
      SELECT id, 'expert', ? FROM meetup15_members WHERE role = 'guest' AND ${fixture}
      ORDER BY created_at, rowid LIMIT 1
    `).bind(timestamp - 300, first.id),
    db.prepare(`
      INSERT INTO meetup15_discussion (kind, author_id, section, body, round_id, answered, created_at)
      SELECT 'question', value->>'author', 'expert', value->>'body', r.id, value->>'answered', value->>'createdAt'
      FROM json_each(?) CROSS JOIN meetup15_qa_rounds r WHERE r.closed_at IS NULL AND ${fixture}
    `).bind(JSON.stringify(questions), first.id),
    db.prepare(`
      INSERT INTO meetup15_discussion_likes (item_id, member_id)
      SELECT d.id, value->>'member' FROM json_each(?)
      JOIN meetup15_discussion d ON d.author_id = value->>'target' AND d.kind = value->>'kind'
      WHERE d.author_id <> value->>'member' AND ${fixture}
    `).bind(JSON.stringify(likes), first.id),
    db.prepare(`
      INSERT INTO meetup15_raffles (candidates, ready_at, finished_at, winner_id, winner_name, weighted, require_participation)
      SELECT ?, ?, ?, ?, ?, 1, 0 WHERE ${fixture}
    `).bind(JSON.stringify(candidates), now, now, first.id, first.name, first.id),
    db.prepare(`
      INSERT INTO meetup15_dm_threads (member_a)
      SELECT ? WHERE ${fixture}
    `).bind(first.id, first.id),
    db.prepare(`
      INSERT INTO meetup15_dm_messages (thread_id, raffle_id, body)
      SELECT t.id, r.id, '恭喜你中奖！这是彩排抽奖通知。'
      FROM meetup15_dm_threads t JOIN meetup15_raffles r ON r.winner_id = t.member_a
      WHERE t.member_a = ? AND t.member_b IS NULL
    `).bind(first.id),
    db.prepare(`${resetActivity} AND ${fixture}`).bind('expert', first.id),
  ])
  return results[0].meta.changes === 1
}

function result(status: string) {
  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: `/admin/activity?tab=rehearsal&rehearsal=${status}` },
  })
}

export async function handleMeetupRehearsal(request: Request, env: ActivityEnv, clock = Date.now) {
  if (verifySessionCookie(ACTIVITY_ADMIN_COOKIE, requestCookie(request, ACTIVITY_ADMIN_COOKIE), env.SESSION_SECRET) !== '1') {
    return new Response(null, { status: 401, headers })
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } })
  if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response(null, { status: 403, headers })
  const form = await request.formData().catch(() => null)
  const now = clock()
  if (now >= REHEARSAL_END) return result('closed')
  const action = form?.get('action')
  const value = form?.get('revision')
  const revision = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  if ((action !== 'clear' && action !== 'fill') || !Number.isSafeInteger(revision)) return result('invalid')

  const db = env.ACTIVITY_DB
  const changed = action === 'clear' ? await clearRehearsal(db, revision) : await fillRehearsal(db, revision, now)
  if (!changed) return result(action === 'clear' ? 'changed' : 'blocked')

  const discussion = env.ACTIVITY_UPDATES.getByName('meetup-15-discussion')
  const notifications = await Promise.allSettled([
    env.ACTIVITY_UPDATES.getByName('meetup-15').publish(),
    action === 'clear' ? discussion.resetRehearsalConnections() : discussion.queueDiscussionUpdate('all'),
  ])
  for (const notification of notifications) {
    if (notification.status === 'rejected') console.error('Rehearsal notification failed', notification.reason)
  }
  return result(action === 'clear' ? 'cleared' : 'filled')
}
