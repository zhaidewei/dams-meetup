import type {
  DiscussionItem, FeedSnapshot, QuestionRound, StaffSnapshot,
} from '../src/lib/meetup15/discussion'
import type { Member } from '../src/lib/meetup15/identity'
import { isMeetupSection, meetupSectionAt, nextMeetupSectionChange } from '../src/lib/meetup15/event'

const PAGE_SIZE = 30
const ROUNDS = `
  SELECT r.id, m.display_name AS guest, r.section, r.opened_at AS openedAt, r.closed_at AS closedAt
  FROM meetup15_qa_rounds r JOIN meetup15_members m ON m.id = r.guest_id`
const ITEM_FIELDS = `
  d.id, d.kind, COALESCE(m.display_name, '现场观众') AS author,
  d.author_id = ? AS mine, d.body, d.tags,
  d.post_id AS postId, d.parent_reply_id AS parentId, d.answered,
  (SELECT COUNT(*) FROM meetup15_discussion_likes l WHERE l.item_id = d.id) AS likes,
  EXISTS(SELECT 1 FROM meetup15_discussion_likes l WHERE l.item_id = d.id AND l.member_id = ?) AS liked,
  d.created_at AS createdAt`

type ItemRow = Omit<DiscussionItem, 'tags' | 'mine' | 'liked' | 'answered'> & {
  tags: string
  mine: number
  liked: number
  answered: number
}

function item(row: ItemRow): DiscussionItem {
  return { ...row, tags: JSON.parse(row.tags), mine: Boolean(row.mine),
    liked: Boolean(row.liked), answered: Boolean(row.answered) }
}

async function readContext(db: D1Database, now: number) {
  const [settings, rounds] = await db.batch([
    db.prepare('SELECT section_override FROM activity_state WHERE id = 1'),
    db.prepare(`${ROUNDS} ORDER BY r.id DESC`),
  ])
  const override = (settings.results[0] as { section_override?: unknown } | undefined)?.section_override
  const section = isMeetupSection(override) ? override : null
  const history = rounds.results as unknown as QuestionRound[]
  return {
    currentSection: section ?? meetupSectionAt(now),
    override: section,
    refreshAt: section ? null : nextMeetupSectionChange(now),
    rounds: history,
    activeRound: history.find((round) => round.closedAt === null) ?? null,
  }
}

function questionsQuery(db: D1Database, roundId: number, viewer: string) {
  return db.prepare(`
    SELECT ${ITEM_FIELDS}
    FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
    WHERE d.round_id = ?
    ORDER BY d.answered, likes DESC, d.created_at, d.id`
  ).bind(viewer, viewer, roundId)
}

async function readQuestions(db: D1Database, round: QuestionRound | null, viewer: string) {
  if (!round) return []
  const { results } = await questionsQuery(db, round.id, viewer).all<ItemRow>()
  return results.map(item)
}

export async function readFeed(db: D1Database, member: Member, url: URL, now: number): Promise<FeedSnapshot> {
  const context = await readContext(db, now)
  const viewer = member.id
  const wantedSection = url.searchParams.get('section')
  const section = isMeetupSection(wantedSection) ? wantedSection : context.currentSection
  const wantedRound = url.searchParams.get('round')
  const viewedRound = wantedRound
    ? context.rounds.find((round) => String(round.id) === wantedRound && round.section === section) ?? null
    : context.activeRound?.section === section ? context.activeRound : null
  const before = Number(url.searchParams.get('before'))
  const cursor = Number.isSafeInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER
  const [questions, feed] = await Promise.all([
    readQuestions(db, viewedRound, viewer),
    db.prepare(`
      WITH page AS (
        SELECT id FROM meetup15_discussion
        WHERE kind = 'post' AND section = ? AND id < ?
        ORDER BY id DESC LIMIT ?
      )
      SELECT ${ITEM_FIELDS}
      FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
      WHERE d.id IN (SELECT id FROM page) OR d.post_id IN (SELECT id FROM page)
      ORDER BY d.id DESC`
    ).bind(section, cursor, PAGE_SIZE + 1, viewer, viewer).all<ItemRow>(),
  ])
  const extra = feed.results.filter((row) => row.kind === 'post')[PAGE_SIZE]
  const items = extra ? feed.results.filter((row) => row.id !== extra.id && row.postId !== extra.id) : feed.results
  const nextBefore = extra ? items.findLast((row) => row.kind === 'post')?.id ?? null : null
  return { ...context, nickname: member.display_name, section, viewedRound, questions, items: items.map(item), nextBefore }
}

export async function readDiscussionAdmin(db: D1Database, now: number): Promise<StaffSnapshot> {
  const context = await readContext(db, now)
  const [questions, guests] = await Promise.all([
    readQuestions(db, context.activeRound, ''),
    db.prepare("SELECT id, display_name AS name FROM meetup15_members WHERE role = 'guest' ORDER BY name, id")
      .all<StaffSnapshot['guests'][number]>(),
  ])
  return { ...context, viewedRound: context.activeRound, questions, guests: guests.results }
}

export function readProjectionRounds(db: D1Database) {
  return db.prepare(`${ROUNDS} ORDER BY (r.closed_at IS NULL) DESC, r.opened_at DESC, r.id DESC`)
}

export async function readProjectionRound(db: D1Database, roundId: number, revision?: number) {
  const roundQuery = revision === undefined
    ? db.prepare(`${ROUNDS} WHERE r.id = ?`).bind(roundId)
    : db.prepare(`${ROUNDS} WHERE r.id = ? AND EXISTS (
        SELECT 1 FROM activity_state WHERE id = 1 AND projection_revision = ?
      )`).bind(roundId, revision)
  const [rounds, questions] = await db.batch([roundQuery, questionsQuery(db, roundId, '')])
  const round = rounds.results[0] as QuestionRound | undefined
  return round ? { round, questions: (questions.results as unknown as ItemRow[]).map(item) } : null
}
