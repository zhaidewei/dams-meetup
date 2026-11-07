import { ADMISSION_END, isMeetupSection, type MeetupSection } from '../src/lib/meetup15/event'
import type { Member } from '../src/lib/meetup15/identity'
import type { PollUpdate } from '../src/lib/meetup15/polls'

type Input = Record<string, unknown>
type WriteResult = { error: string; status: number } | { event: PollUpdate | null }
const invalid = { error: '请检查输入后重试。', status: 400 }
const unavailable = { error: '投票已截止或不可用。', status: 409 }

function pollId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export async function writePoll(db: D1Database, member: Member, input: Input, databaseTime: number | null): Promise<WriteResult> {
  const { action, id } = input
  if (action === 'create') {
    if (member.role !== 'guest') return { error: '只有嘉宾可以发起投票。', status: 403 }
    const { section, title, options, multiple, hidden } = input
    if (!isMeetupSection(section) || typeof title !== 'string' || typeof multiple !== 'boolean' ||
        typeof hidden !== 'boolean' || !Array.isArray(options) || options.length < 2 || options.length > 6 ||
        !options.every((option) => typeof option === 'string' && option.trim() && option.trim().length <= 120)) {
      return invalid
    }
    const cleanOptions = options.map((option: string) => option.trim())
    if (!title.trim() || title.trim().length > 300 || new Set(cleanOptions).size !== cleanOptions.length) return invalid
    const deadline = ADMISSION_END / 1000
    const result = await db.prepare(`
      INSERT INTO meetup15_polls (author_id, section, title, options, multiple, hidden, deadline)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE COALESCE(?, unixepoch()) < ?`
    ).bind(member.id, section, title.trim(), JSON.stringify(cleanOptions), Number(multiple), Number(hidden),
      deadline, databaseTime, deadline).run()
    return result.meta.changes ? { event: `poll.updated:${section}` } : unavailable
  }

  if (!pollId(id)) return invalid
  if (action === 'close') {
    if (member.role !== 'guest') return { error: '只有投票发起人可以结束投票。', status: 403 }
    const poll = await db.prepare(`
      UPDATE meetup15_polls SET closed_at = COALESCE(?, unixepoch())
      WHERE id = ? AND author_id = ? AND closed_at IS NULL AND deadline > COALESCE(?, unixepoch())
      RETURNING section`
    ).bind(databaseTime, id, member.id, databaseTime).first<{ section: MeetupSection }>()
    return poll ? { event: `poll.updated:${poll.section}` } : unavailable
  }

  if (action !== 'vote' || member.role !== 'attendee') {
    return { error: '请使用观众身份投票。', status: 403 }
  }
  const { choices } = input
  if (!Array.isArray(choices) || choices.length < 1 || choices.length > 6 ||
      !choices.every((choice) => Number.isInteger(choice) && choice >= 0 && choice < 6) ||
      new Set(choices).size !== choices.length) return invalid

  const ballot = JSON.stringify([...choices].sort((a, b) => a - b))
  const acceptsVote = `closed_at IS NULL AND deadline > COALESCE(?, unixepoch())
    AND json_array_length(options) > ? AND (multiple = 1 OR ? = 1)`
  const conditions = [databaseTime, Math.max(...choices), choices.length]
  // 区分仍可投票的重复提交和已截止或无效的请求。两条语句一起执行。
  const [write, lookup] = await db.batch<{ section: MeetupSection; accepts: number }>([
    db.prepare(`
      INSERT INTO meetup15_ballots (poll_id, member_id, choices)
      SELECT id, ?, ? FROM meetup15_polls WHERE id = ? AND ${acceptsVote}
      ON CONFLICT (poll_id, member_id) DO UPDATE SET choices = excluded.choices
      WHERE (
        SELECT json_group_array(value)
        FROM (SELECT value FROM json_each(meetup15_ballots.choices) ORDER BY value)
      ) <> excluded.choices
    `).bind(member.id, ballot, id, ...conditions),
    db.prepare(`SELECT section, (${acceptsVote}) AS accepts FROM meetup15_polls WHERE id = ?`)
      .bind(...conditions, id),
  ])
  const poll = lookup.results[0]
  if (!poll || (!write.meta.changes && !poll.accepts)) return unavailable
  return { event: write.meta.changes ? `poll.updated:${poll.section}` : null }
}

export async function writeScreen(db: D1Database, input: Input, databaseTime: number | null): Promise<WriteResult> {
  const { action, section, id } = input
  let statement: D1PreparedStatement
  switch (action) {
    case 'intro':
      statement = db.prepare("UPDATE activity_state SET screen_mode = 'intro' WHERE id = 1 AND reveal_poll_id IS NULL")
      break
    case 'live':
      statement = db.prepare("UPDATE activity_state SET screen_mode = 'live', reveal_poll_id = NULL WHERE id = 1")
      break
    case 'filter':
      if (section !== null && !isMeetupSection(section)) return invalid
      statement = db.prepare('UPDATE activity_state SET screen_poll_section = ? WHERE id = 1').bind(section)
      break
    case 'reveal':
      if (!pollId(id)) return invalid
      statement = db.prepare(`
        UPDATE activity_state SET reveal_poll_id = ?
        WHERE id = 1 AND reveal_poll_id IS NULL AND EXISTS (
          SELECT 1 FROM meetup15_polls WHERE id = ? AND hidden = 1 AND (closed_at IS NOT NULL OR deadline <= COALESCE(?, unixepoch()))
        )`).bind(id, id, databaseTime)
      break
    default:
      return invalid
  }
  const result = await statement.run()
  return result.meta.changes ? { event: 'screen.updated' } : { error: '当前无法切换大屏。请检查投票状态。', status: 409 }
}
