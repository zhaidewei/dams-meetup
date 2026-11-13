import { MAX_DISCUSSION_BODY, MAX_QUESTION_BODY, MAX_QA_TITLE, DISCUSSION_EMOJIS, type QaWriteAck } from '../src/lib/meetup15/discussion'
import { isMeetupAgendaSection, isMeetupSection, MEETUP_AGENDA, MEETUP_DISCUSSION_AGENDA } from '../src/lib/meetup15/event'
import type { Member } from '../src/lib/meetup15/identity'
import { parseTags } from '../src/lib/tags'

type Input = Record<string, unknown>
type Result = { changed: boolean; qa?: true; ack?: QaWriteAck } | { error: string; status: number }

const invalid = { error: '请检查输入后重试。', status: 400 }
const unavailable = { error: '内容已变更，请刷新后重试。', status: 409 }
const unchanged = { changed: false }
const qaRevision = 'SELECT question_revision AS revision FROM activity_state WHERE id = 1'

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
    const [liked, version] = await db.batch([
      statement.bind(id, member.id, id),
      db.prepare(`SELECT d.round_id AS roundId, a.question_revision AS revision
        FROM meetup15_discussion d CROSS JOIN activity_state a WHERE d.id = ? AND a.id = 1`).bind(id),
    ])
    const state = version.results[0] as { roundId: number | null; revision: number } | undefined
    const ack = liked.meta.changes && state?.roundId ? { roundId: state.roundId, revision: state.revision, like: { id, liked: input.liked } } : undefined
    return { changed: Boolean(liked.meta.changes), qa: ack ? true : undefined, ack }
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
    case 'question': {
      if (!validId(input.roundId) || !isMeetupSection(input.section)) return invalid
      const [inserted, version] = await db.batch([db.prepare(`
        INSERT INTO meetup15_discussion (kind, author_id, section, body, round_id)
        SELECT 'question', ?, section, ?, id FROM meetup15_qa_rounds
        WHERE id = ? AND section = ? AND closed_at IS NULL
        RETURNING id, created_at AS createdAt`).bind(member.id, body, input.roundId, input.section),
        db.prepare(qaRevision),
      ])
      const row = inserted.results[0] as { id: number; createdAt: number } | undefined
      const state = version.results[0] as { revision: number }
      return row ? { changed: true, qa: true, ack: {
        roundId: input.roundId, revision: state.revision, question: {
          ...row, kind: 'question', author: member.display_name, authorId: member.id, authorRole: member.role,
          body, tags: [], postId: null, parentId: null, answered: false, likes: 0, mine: true, liked: false,
        },
      } } : unavailable
    }
    default:
      return invalid
  }
}

export async function writeStaff(db: D1Database, input: Input): Promise<Result> {
  switch (input.action) {
    case 'section':
      if (input.section !== null && !isMeetupAgendaSection(input.section)) return invalid
      return write(db.prepare('UPDATE activity_state SET section_override = ?, agenda_start_override = NULL WHERE id = 1').bind(input.section))
    case 'agenda': {
      const slot = MEETUP_AGENDA.find(slot => slot.start === input.start)
      if (input.start !== null && !slot) return invalid
      return write(db.prepare(`UPDATE activity_state SET section_override = ?, agenda_start_override = ? WHERE id = 1`)
        .bind(slot?.section ?? null, slot?.start ?? null))
    }
    case 'start': {
      const { agendaStart, activeRoundId, latestRoundId } = input
      const slot = MEETUP_DISCUSSION_AGENDA.find(slot => slot.start === agendaStart)
      const title = slot?.title ?? (typeof input.title === 'string' ? input.title.trim() : '')
      if ((agendaStart !== null && !slot) || !title || (!slot && title.length > MAX_QA_TITLE) ||
          (activeRoundId !== null && !validId(activeRoundId)) ||
          (latestRoundId !== null && !validId(latestRoundId))) return invalid
      // 数据库触发器只在新轮次写入时结束旧轮次，过期或重复的操作不会改变状态。
      return write(db.prepare(`
        INSERT INTO meetup15_qa_rounds (title, agenda_start, section)
        SELECT ?, ?, ?
        WHERE (SELECT id FROM meetup15_qa_rounds WHERE closed_at IS NULL) IS ?
        AND (SELECT MAX(id) FROM meetup15_qa_rounds) IS ?`
      ).bind(title, slot?.start ?? null, slot?.section ?? 'lounge', activeRoundId, latestRoundId))
    }
    case 'reopen':
    case 'end': {
      const generation = input.action === 'end' && input.generation === undefined ? 0 : input.generation
      if (!validId(input.roundId) || (generation !== 0 && !validId(generation))) return invalid
      if (input.action === 'end') return write(db.prepare(`UPDATE meetup15_qa_rounds SET closed_at = unixepoch()
        WHERE id = ? AND generation = ? AND closed_at IS NULL`).bind(input.roundId, generation))
      return write(db.prepare(`
        UPDATE meetup15_qa_rounds SET closed_at = NULL, generation = generation + 1
        WHERE id = ? AND generation = ? AND closed_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM meetup15_qa_rounds WHERE closed_at IS NULL)
      `).bind(input.roundId, generation))
    }
    case 'answer':
      if (!validId(input.id) || typeof input.answered !== 'boolean') return invalid
      const result = await write(db.prepare(`UPDATE meetup15_discussion SET answered = ?
        WHERE id = ? AND kind = 'question' AND EXISTS (
          SELECT 1 FROM meetup15_qa_rounds r WHERE r.id = round_id AND r.closed_at IS NULL
        )`).bind(Number(input.answered), input.id))
      return 'error' in result ? result : { ...result, qa: true }
    default:
      return invalid
  }
}

export function deleteStaffPost(db: D1Database, input: Input): Promise<Result> | Result {
  if (input.action !== 'delete-post' || !validId(input.id)) return invalid
  return write(db.prepare("DELETE FROM meetup15_discussion WHERE id = ? AND kind = 'post'").bind(input.id))
}
