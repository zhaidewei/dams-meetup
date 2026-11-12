import { REHEARSAL_END } from '../src/lib/meetup15/event'
import { requestCookie } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import type { ActivityEnv } from './activity'

const headers = { 'Cache-Control': 'private, no-store' }
const dataTables = [
  'meetup15_dm_threads', 'meetup15_raffles', 'meetup15_discussion', 'meetup15_qa_rounds', 'meetup15_polls',
]

const resetActivity = `
  UPDATE activity_state SET admission_open = 0, revision = revision + 1,
    section_override = ?, projection_mode = 'hidden', projection_round_id = NULL,
    projection_raffle_id = NULL, projection_revision = projection_revision + 1,
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

const names = ['彩排观众 · 林', '彩排观众 · 周', '彩排观众 · 陈', '彩排观众 · 许', '彩排观众 · 吴', '彩排观众 · 郑']
const posts = [
  ['lounge', '大家好，我在代尔夫特做数据产品，想认识在欧洲创业的朋友。'],
  ['lightning', '如何从第一个试点找到可以复用的销售流程？'],
  ['expert', '融资前可以提前准备哪些资料？欢迎分享经验。'],
  ['breakout', '想交流一下技术团队在荷兰做早期产品的经历。'],
  ['panel', '圆桌结束后想找做企业软件的朋友聊一聊。'],
] as const
const questions = [
  '创业初期还没有成熟产品和市场预算时，你会怎样找到第一批真正愿意付费的客户？能否分享一个从访谈走到试点，再到签约的例子？',
  '在欧洲融资时，投资人最看重哪些早期指标？',
  '从技术原型到商业化，哪项成本最容易被低估？',
  '你会怎样决定先验证哪个细分市场？',
  '什么情况下应该开始寻找联合创始人？',
  '如果首个试点反响一般，应该继续迭代还是换一个方向？',
]

async function fillRehearsal(db: D1Database, revision: number, now: number) {
  const [first, ...others] = names.map((name) => ({ name, id: crypto.randomUUID() }))
  const guests = 'SELECT id FROM meetup15_members WHERE role = \'guest\' ORDER BY created_at, id LIMIT 1'
  const fixture = 'EXISTS (SELECT 1 FROM meetup15_members WHERE id = ?)'
  const openRound = '(SELECT id FROM meetup15_qa_rounds WHERE closed_at IS NULL)'
  const rehearsalPost = '(SELECT id FROM meetup15_discussion WHERE author_id = ? AND kind = \'post\' AND section = \'lounge\')'
  const timestamp = Math.floor(now / 1000)
  const results = await db.batch([
    // 此次操作的随机观众 ID 也用来标识是否成功取得填充资格。并发请求只有一个能写入。
    db.prepare(`
      INSERT INTO meetup15_members (id, role, display_name, last_seen_at)
      SELECT ?, 'attendee', ?, ?
      WHERE EXISTS (SELECT 1 FROM activity_state WHERE id = 1 AND revision = ?)
        AND NOT EXISTS (SELECT 1 FROM meetup15_members WHERE role = 'attendee')
        AND EXISTS (SELECT 1 FROM meetup15_members WHERE role = 'guest')
        ${dataTables.map(table => `AND NOT EXISTS (SELECT 1 FROM ${table})`).join(' ')}
    `).bind(first.id, first.name, timestamp, revision),
    ...others.map(({ id, name }) => db.prepare(`
      INSERT INTO meetup15_members (id, role, display_name, last_seen_at)
      SELECT ?, 'attendee', ?, ? WHERE ${fixture}
    `).bind(id, name, timestamp, first.id)),
    ...posts.map(([section, body], i) => db.prepare(`
      INSERT INTO meetup15_discussion (kind, author_id, section, body, tags)
      SELECT 'post', ?, ?, ?, '["彩排"]' WHERE ${fixture}
    `).bind(i === 0 ? first.id : others[i - 1].id, section, body, first.id)),
    ...['欢迎！我在做早期客户访谈，可以交流。', '我也在代尔夫特，茶歇时一起聊。'].map((body, i) => db.prepare(`
      INSERT INTO meetup15_discussion (kind, author_id, section, body, post_id)
      SELECT 'reply', ?, 'lounge', ?, ${rehearsalPost} WHERE ${fixture}
    `).bind(others[i].id, body, first.id, first.id)),
    db.prepare(`
      INSERT INTO meetup15_qa_rounds (guest_id, section, opened_at)
      SELECT (${guests}), 'expert', ? WHERE ${fixture}
    `).bind(timestamp, first.id),
    ...questions.map((body, i) => db.prepare(`
      INSERT INTO meetup15_discussion (kind, author_id, section, body, round_id, answered)
      SELECT 'question', ?, 'expert', ?, ${openRound}, ? WHERE ${fixture}
    `).bind(i === 0 ? first.id : others[i - 1].id, body, Number(i >= 4), first.id)),
    db.prepare(`
      INSERT INTO meetup15_discussion_likes (item_id, member_id)
      SELECT q.id, m.id FROM meetup15_discussion q CROSS JOIN meetup15_members m
      WHERE q.kind = 'question' AND q.author_id = ? AND m.id IN (?, ?) AND ${fixture}
    `).bind(first.id, others[0].id, others[1].id, first.id),
    db.prepare(`
      INSERT INTO meetup15_raffles (candidates, ready_at, finished_at, winner_id, winner_name, weighted, require_participation)
      SELECT ?, ?, ?, ?, ?, 1, 0 WHERE ${fixture}
    `).bind(JSON.stringify([first, ...others].map(({ id, name }, i) => ({ id, name, weight: [3, 2, 2, 2, 2, 1][i] }))),
      now, now, first.id, first.name, first.id),
    db.prepare(`
      INSERT INTO meetup15_dm_threads (member_a)
      SELECT ? WHERE ${fixture}
    `).bind(first.id, first.id),
    db.prepare(`
      INSERT INTO meetup15_dm_messages (thread_id, raffle_id, body)
      SELECT t.id, r.id, '恭喜你获得彩排抽奖奖品。'
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

export async function handleMeetupRehearsal(request: Request, env: ActivityEnv, now = Date.now()) {
  if (verifySessionCookie(ACTIVITY_ADMIN_COOKIE, requestCookie(request, ACTIVITY_ADMIN_COOKIE), env.SESSION_SECRET) !== '1') {
    return new Response(null, { status: 401, headers })
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } })
  if (request.headers.get('Origin') !== new URL(request.url).origin) return new Response(null, { status: 403, headers })
  if (now >= REHEARSAL_END) return result('closed')

  const form = await request.formData().catch(() => null)
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
