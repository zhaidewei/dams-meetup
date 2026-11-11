import { MAX_DISCUSSION_BODY, MAX_QUESTION_BODY, DISCUSSION_EMOJIS } from '../src/lib/meetup15/discussion'
import { isMeetupAgendaSection, isMeetupSection, meetupSectionAt } from '../src/lib/meetup15/event'
import type { Member } from '../src/lib/meetup15/identity'
import { parseTags } from '../src/lib/tags'

type Input = Record<string, unknown>
type Result = { changed: boolean } | { error: string; status: number }

const invalid = { error: '请检查输入后重试。', status: 400 }
const unavailable = { error: '内容已变更，请刷新后重试。', status: 409 }
const unchanged = { changed: false }

function validId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

async function write(statement: D1PreparedStatement): Promise<Result> {
  return (await statement.run()).meta.changes ? { changed: true } : unavailable
}

const likeable = `EXISTS (
  SELECT 1 FROM meetup15_discussion d WHERE d.id = ? AND
  (d.kind = 'post' OR (d.kind = 'question' AND EXISTS (
    SELECT 1 FROM meetup15_qa_rounds r WHERE r.id = d.round_id AND r.closed_at IS NULL
  )))
)`

export async function writeMember(db: D1Database, member: Member, input: Input): Promise<Result> {
  const id = input.id
  if (input.action === 'reaction') {
    const { emoji, reacted } = input
    if (!validId(id) || typeof emoji !== 'string' || !DISCUSSION_EMOJIS.some(([value]) => value === emoji) ||
        typeof reacted !== 'boolean') return invalid
    const statement = reacted
      ? db.prepare(`INSERT INTO meetup15_reply_reactions (reply_id, emoji, member_id)
          SELECT id, ?, ? FROM meetup15_discussion WHERE id = ? AND kind IN ('post', 'reply')
          ON CONFLICT (reply_id, emoji, member_id) DO NOTHING`)
      : db.prepare('DELETE FROM meetup15_reply_reactions WHERE emoji = ? AND member_id = ? AND reply_id = ?')
    const { meta } = await statement.bind(emoji, member.id, id).run()
    return { changed: Boolean(meta.changes) }
  }
  if (input.action === 'like') {
    if (!validId(id) || typeof input.liked !== 'boolean') return invalid
    const statement = input.liked
      ? db.prepare(`INSERT OR IGNORE INTO meetup15_discussion_likes (item_id, member_id)
          SELECT ?, ? WHERE ${likeable}`)
      : db.prepare(`DELETE FROM meetup15_discussion_likes WHERE item_id = ? AND member_id = ? AND ${likeable}`)
    return { changed: Boolean((await statement.bind(id, member.id, id).run()).meta.changes) }
  }
  if (input.action === 'nickname') {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name || [...name].length > 24) return { error: '昵称需要 1–24 个字。', status: 400 }
    if (member.role !== 'attendee') return invalid
    if (member.display_name === name) return unchanged
    return write(db.prepare(`UPDATE meetup15_members SET display_name = ?
      WHERE id = ? AND display_name IS NULL`).bind(name, member.id))
  }
  if (input.action === 'delete') {
    if (!validId(id)) return invalid
    return write(db.prepare(`DELETE FROM meetup15_discussion
      WHERE id = ? AND author_id = ? AND kind IN ('post', 'reply')`).bind(id, member.id))
  }
  if (!member.display_name) return { error: '请先填写昵称。', status: 403 }
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  const isQuestion = input.action === 'question'
  const maxLength = isQuestion ? MAX_QUESTION_BODY : MAX_DISCUSSION_BODY
  if (!body || [...body].length > maxLength || body.includes('\0')) {
    return { error: isQuestion ? `问题需要 1–${maxLength} 个字（含标点）。` : '正文需要 1–300 个字。', status: 400 }
  }
  const tags = JSON.stringify(parseTags(typeof input.tags === 'string' ? input.tags.slice(0, 160) : ''))
  switch (input.action) {
    case 'post':
      if (!isMeetupSection(input.section)) return invalid
      return write(db.prepare(`INSERT INTO meetup15_discussion (kind, author_id, section, body, tags)
        VALUES ('post', ?, ?, ?, ?)`).bind(member.id, input.section, body, tags))
    case 'reply': {
      const { postId, parentId } = input
      if (!validId(postId) || (parentId !== null && !validId(parentId))) return invalid
      return write(db.prepare(`
        INSERT INTO meetup15_discussion (kind, author_id, section, body, post_id, parent_reply_id)
        SELECT 'reply', ?, p.section, ?, p.id, ?
        FROM meetup15_discussion p WHERE p.id = ? AND p.kind = 'post'
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM meetup15_discussion r WHERE r.id = ? AND r.kind = 'reply'
          AND r.post_id = p.id AND r.parent_reply_id IS NULL
        ))`).bind(member.id, body, parentId, postId, parentId, parentId))
    }
    case 'edit':
      if (!validId(id)) return invalid
      return write(db.prepare(`UPDATE meetup15_discussion SET body = ?,
        tags = CASE WHEN kind = 'post' THEN ? ELSE tags END
        WHERE id = ? AND author_id = ? AND kind IN ('post', 'reply')`).bind(body, tags, id, member.id))
    case 'question':
      if (!validId(input.roundId) || !isMeetupSection(input.section)) return invalid
      return write(db.prepare(`
        INSERT INTO meetup15_discussion (kind, author_id, section, body, round_id)
        SELECT 'question', ?, section, ?, id FROM meetup15_qa_rounds
        WHERE id = ? AND section = ? AND closed_at IS NULL`).bind(member.id, body, input.roundId, input.section))
    default:
      return invalid
  }
}

export async function writeStaff(db: D1Database, input: Input, now: number): Promise<Result> {
  switch (input.action) {
    case 'section':
      if (input.section !== null && !isMeetupAgendaSection(input.section)) return invalid
      return write(db.prepare('UPDATE activity_state SET section_override = ? WHERE id = 1').bind(input.section))
    case 'start': {
      const { guestId, activeRoundId, latestRoundId } = input
      if (typeof guestId !== 'string' || guestId.length > 36 ||
          (activeRoundId !== null && !validId(activeRoundId)) ||
          (latestRoundId !== null && !validId(latestRoundId))) return invalid
      // 数据库触发器只在新轮次写入时结束旧轮次，过期或重复的操作不会改变状态。
      return write(db.prepare(`
        INSERT INTO meetup15_qa_rounds (guest_id, section)
        SELECT g.id, COALESCE(s.section_override, ?)
        FROM meetup15_members g CROSS JOIN activity_state s
        WHERE g.id = ? AND g.role = 'guest' AND s.id = 1
        AND (SELECT id FROM meetup15_qa_rounds WHERE closed_at IS NULL) IS ?
        AND (SELECT MAX(id) FROM meetup15_qa_rounds) IS ?`
      ).bind(meetupSectionAt(now), guestId, activeRoundId, latestRoundId))
    }
    case 'end':
      if (!validId(input.roundId)) return invalid
      return write(db.prepare(`UPDATE meetup15_qa_rounds SET closed_at = unixepoch()
        WHERE id = ? AND closed_at IS NULL`).bind(input.roundId))
    case 'answer':
      if (!validId(input.id) || typeof input.answered !== 'boolean') return invalid
      return write(db.prepare(`UPDATE meetup15_discussion SET answered = ?
        WHERE id = ? AND kind = 'question' AND EXISTS (
          SELECT 1 FROM meetup15_qa_rounds r WHERE r.id = round_id AND r.closed_at IS NULL
        )`).bind(Number(input.answered), input.id))
    default:
      return invalid
  }
}

export function deleteStaffPost(db: D1Database, input: Input): Promise<Result> | Result {
  if (input.action !== 'delete-post' || !validId(input.id)) return invalid
  return write(db.prepare("DELETE FROM meetup15_discussion WHERE id = ? AND kind = 'post'").bind(input.id))
}
