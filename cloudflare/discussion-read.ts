import type {
  DiscussionItem, FeedSnapshot, QuestionRound, ReplyPage, ReplyReaction, StaffSnapshot,
} from '../src/lib/meetup15/discussion'
import type { Member } from '../src/lib/meetup15/identity'
import { isMeetupSection, meetupSectionAt, nextMeetupSectionChange } from '../src/lib/meetup15/event'

const PAGE_SIZE = 30
const ROUNDS = `
  SELECT r.id, m.display_name AS guest, r.section, r.opened_at AS openedAt, r.closed_at AS closedAt
  FROM meetup15_qa_rounds r JOIN meetup15_members m ON m.id = r.guest_id`
const ITEM_CONTENT = `
  d.id, d.kind, d.author_id AS authorId, COALESCE(m.display_name, '现场观众') AS author,
  d.body, d.tags, d.post_id AS postId, d.parent_reply_id AS parentId, d.answered, d.created_at AS createdAt`
const ITEM_FIELDS = `
  ${ITEM_CONTENT}, d.author_id = ? AS mine,
  (SELECT COUNT(*) FROM meetup15_discussion_likes l WHERE l.item_id = d.id) AS likes,
  EXISTS(SELECT 1 FROM meetup15_discussion_likes l WHERE l.item_id = d.id AND l.member_id = ?) AS liked`

type ItemRow = Omit<DiscussionItem, 'tags' | 'mine' | 'liked' | 'answered' | 'reactions'> & {
  tags: string
  mine: number
  liked: number
  answered: number
  reactionData?: string | null
}

function item({ reactionData, ...row }: ItemRow): DiscussionItem {
  const reactions = reactionData ? JSON.parse(reactionData) as ReplyReaction[] : undefined
  return { ...row, reactions, tags: JSON.parse(row.tags), mine: Boolean(row.mine),
    liked: Boolean(row.liked), answered: Boolean(row.answered) }
}

async function readContext(db: D1Database, now: number) {
  const [settings, rounds] = await db.batch([
    db.prepare('SELECT section_override, question_revision FROM activity_state WHERE id = 1'),
    db.prepare(`${ROUNDS} ORDER BY r.id DESC`),
  ])
  const state = settings.results[0] as { section_override: unknown; question_revision: number } | undefined
  const override = state?.section_override
  const section = isMeetupSection(override) ? override : null
  const history = rounds.results as unknown as QuestionRound[]
  return {
    revision: state?.question_revision,
    context: {
      currentSection: section ?? meetupSectionAt(now),
      override: section,
      refreshAt: section ? null : nextMeetupSectionChange(now),
      rounds: history,
      activeRound: history.find((round) => round.closedAt === null) ?? null,
    },
  }
}

type SharedQuestion = Omit<DiscussionItem, 'mine' | 'liked'> & { likedBy: Set<string> }
type QuestionContentRow = Omit<ItemRow, 'mine' | 'liked' | 'likes'>

// A Worker isolate serves one activity database. D1 revisions also invalidate other isolates.
const questionSnapshots = new Map<number, { revision: number; rows: Promise<SharedQuestion[]> }>()
const MAX_CACHED_ROUNDS = 8

async function loadSharedQuestions(db: D1Database, roundId: number): Promise<SharedQuestion[]> {
  const [questions, likes] = await db.batch([
    db.prepare(`
      SELECT ${ITEM_CONTENT}
      FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
      WHERE d.round_id = ?
    `).bind(roundId),
    db.prepare(`
      SELECT l.item_id AS itemId, l.member_id AS memberId
      FROM meetup15_discussion d JOIN meetup15_discussion_likes l ON l.item_id = d.id
      WHERE d.round_id = ?
    `).bind(roundId),
  ])
  const byQuestion = new Map<number, Set<string>>()
  for (const { itemId, memberId } of likes.results as { itemId: number; memberId: string }[]) {
    const likedBy = byQuestion.get(itemId) ?? new Set<string>()
    likedBy.add(memberId)
    byQuestion.set(itemId, likedBy)
  }
  return (questions.results as QuestionContentRow[]).map(row => {
    const likedBy = byQuestion.get(row.id) ?? new Set<string>()
    return { ...row, tags: JSON.parse(row.tags), answered: Boolean(row.answered), likes: likedBy.size, likedBy }
  }).sort((a, b) => Number(a.answered) - Number(b.answered) || b.likes - a.likes ||
    a.createdAt - b.createdAt || a.id - b.id)
}

function sharedQuestions(db: D1Database, roundId: number, revision: number | undefined, execution?: ExecutionContext) {
  const cached = questionSnapshots.get(roundId)
  if (revision === undefined || (cached && cached.revision > revision)) return loadSharedQuestions(db, roundId)
  if (cached?.revision === revision) return cached.rows
  const rows = loadSharedQuestions(db, roundId).catch(error => {
    if (questionSnapshots.get(roundId)?.rows === rows) questionSnapshots.delete(roundId)
    throw error
  })
  // Keep the shared read alive if the client that started it disconnects.
  execution?.waitUntil(rows.catch(() => {}))
  questionSnapshots.delete(roundId)
  questionSnapshots.set(roundId, { revision, rows })
  if (questionSnapshots.size > MAX_CACHED_ROUNDS) {
    const oldest = questionSnapshots.keys().next().value
    if (oldest !== undefined) questionSnapshots.delete(oldest)
  }
  return rows
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

export async function readFeed(db: D1Database, member: Member, url: URL, now: number, execution?: ExecutionContext): Promise<FeedSnapshot> {
  const { context, revision } = await readContext(db, now)
  const viewer = member.id
  const wantedSection = url.searchParams.get('section')
  const section = isMeetupSection(wantedSection) ? wantedSection : context.currentSection
  const wantedRound = url.searchParams.get('round')
  const viewedRound = wantedRound
    ? context.rounds.find((round) => String(round.id) === wantedRound && round.section === section) ?? null
    : context.activeRound?.section === section ? context.activeRound : null
  const before = Number(url.searchParams.get('before'))
  const cursor = Number.isSafeInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER
  const [shared, feed] = await Promise.all([
    viewedRound ? sharedQuestions(db, viewedRound.id, revision, execution) : [],
    db.prepare(`
      SELECT ${ITEM_FIELDS},
        (SELECT COUNT(*) FROM meetup15_discussion r WHERE r.post_id = d.id) AS replyCount
      FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
      WHERE d.kind = 'post' AND d.section = ? AND d.id < ?
      ORDER BY d.id DESC LIMIT ?`
    ).bind(viewer, viewer, section, cursor, PAGE_SIZE + 1).all<ItemRow>(),
  ])
  const items = feed.results.slice(0, PAGE_SIZE)
  const nextBefore = feed.results.length > PAGE_SIZE ? items.at(-1)?.id ?? null : null
  const questions = shared.map(({ likedBy, ...question }) => ({
    ...question, mine: question.authorId === viewer, liked: likedBy.has(viewer),
  }))
  return { ...context, nickname: member.display_name, section, viewedRound, questions, items: items.map(item), nextBefore }
}

export async function readReplies(db: D1Database, viewer: string, post: number, parent: number | null, after: number): Promise<ReplyPage> {
  const pageSize = 10
  const where = parent === null
    ? 'd.post_id = ? AND d.parent_reply_id IS NULL AND d.id > ?'
    : 'd.parent_reply_id = ? AND d.post_id = ? AND d.id > ?'
  const range = parent === null ? [post, after] : [parent, post, after]
  const { results } = await db.prepare(`
    SELECT ${ITEM_CONTENT}, d.author_id = ? AS mine, 0 AS likes, 0 AS liked,
      (SELECT COUNT(*) FROM meetup15_discussion r WHERE r.parent_reply_id = d.id) AS replyCount,
      (
        SELECT json_group_array(json_object('emoji', emoji, 'count', total, 'reacted', json(own)))
        FROM (
          SELECT emoji, COUNT(*) AS total, CASE MAX(member_id = ?) WHEN 1 THEN 'true' ELSE 'false' END AS own
          FROM meetup15_reply_reactions WHERE reply_id = d.id GROUP BY emoji
        )
      ) AS reactionData
    FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
    WHERE ${where}
    ORDER BY d.id LIMIT ?`
  ).bind(viewer, viewer, ...range, pageSize + 1).all<ItemRow>()
  const items = results.slice(0, pageSize).map(item)
  return { items, nextAfter: results.length > pageSize ? items.at(-1)?.id ?? null : null, refreshAt: null }
}

export async function readDiscussionAdmin(db: D1Database, now: number): Promise<StaffSnapshot> {
  const { context } = await readContext(db, now)
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
