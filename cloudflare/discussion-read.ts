import { createHash } from 'node:crypto'
import { compareQuestions } from '../src/lib/meetup15/discussion'
import type {
  DiscussionItem, DiscussionEmoji, FeedUpdate, FeedVersions, QuestionDelta, ModerationPage, QuestionRound, ReplyPage, DiscussionReaction, StaffSnapshot,
} from '../src/lib/meetup15/discussion'
import { INTERACTION_END, isMeetupAgendaSection, isMeetupSection, currentMeetupAgenda, nextMeetupAgendaChange, meetupSectionAt, nextMeetupSectionChange } from '../src/lib/meetup15/event'

const PAGE_SIZE = 30
const ROUNDS = `
  SELECT r.id, r.title, r.agenda_start AS agendaStart, r.section, r.opened_at AS openedAt, r.closed_at AS closedAt, r.generation
  FROM meetup15_qa_rounds r`
const ITEM_CONTENT = `
  d.id, d.kind, d.author_id AS authorId, COALESCE(m.display_name, '现场观众') AS author,
  m.role AS authorRole, d.body, d.tags, d.post_id AS postId, d.parent_reply_id AS parentId, d.answered, d.created_at AS createdAt`
const ITEM_FIELDS = `
  ${ITEM_CONTENT}, d.author_id = ? AS mine,
  (SELECT COUNT(*) FROM meetup15_discussion_likes l WHERE l.item_id = d.id) AS likes,
  EXISTS(SELECT 1 FROM meetup15_discussion_likes l WHERE l.item_id = d.id AND l.member_id = ?) AS liked`

const REACTION_DATA = `(
        SELECT json_group_array(json_object('emoji', emoji, 'count', total, 'reacted', json(own)))
        FROM (
          SELECT emoji, COUNT(*) AS total, CASE MAX(member_id = ?) WHEN 1 THEN 'true' ELSE 'false' END AS own
          FROM meetup15_reply_reactions WHERE reply_id = d.id GROUP BY emoji
        )
      ) AS reactionData`

type ItemRow = Omit<DiscussionItem, 'tags' | 'mine' | 'liked' | 'answered' | 'reactions'> & {
  tags: string
  mine: number
  liked: number
  answered: number
  reactionData?: string | null
}

function item({ reactionData, ...row }: ItemRow): DiscussionItem {
  const reactions = reactionData ? JSON.parse(reactionData) as DiscussionReaction[] : undefined
  return { ...row, reactions, tags: JSON.parse(row.tags), mine: Boolean(row.mine),
    liked: Boolean(row.liked), answered: Boolean(row.answered) }
}

function discussionContext(override: unknown, history: QuestionRound[], now: number) {
  const section = isMeetupAgendaSection(override) ? override : null
  return {
    currentSection: section ?? meetupSectionAt(now),
    override: section,
    refreshAt: section ? null : nextMeetupSectionChange(now),
    rounds: history,
    activeRound: history.find(round => round.closedAt === null) ?? null,
  }
}

type SharedQuestion = Omit<DiscussionItem, 'mine' | 'liked'> & { likedBy: Set<string> }
type QuestionContentRow = Omit<ItemRow, 'mine' | 'liked' | 'likes'>
type SharedPost = SharedQuestion & { reactionsByMember: { emoji: DiscussionEmoji; members: string[] }[] }
type FeedState = {
  display_name: string | null
  section_override: unknown
  question_revision: number
  post_revision: number
  round_revision: number
}

type Cached<T> = { revision: number; stamp: string; rows: Promise<T> }

// Each isolate is bound to one activity database. Revisions invalidate all isolates.
const questionSnapshots = new Map<string, Cached<QuestionState | null>>()
const postSnapshots = new Map<string, Cached<SharedPost[]>>()
const roundSnapshots = new Map<string, Cached<QuestionRound[]>>()

function sharedSnapshot<Key, Rows>(
  snapshots: Map<Key, Cached<Rows>>, key: Key, revision: number,
  load: () => Promise<Rows>, limit: number, execution?: ExecutionContext,
) {
  const cached = snapshots.get(key)
  if (cached?.revision === revision) return { ...cached, status: 'hit' }
  const stamp = crypto.randomUUID()
  if (cached && cached.revision > revision) return { stamp, rows: load(), status: 'miss' }
  const rows = load().catch(error => {
    if (snapshots.get(key)?.rows === rows) snapshots.delete(key)
    throw error
  })
  execution?.waitUntil(rows.catch(() => {}))
  snapshots.delete(key)
  snapshots.set(key, { revision, stamp, rows })
  if (snapshots.size > limit) {
    for (const oldest of snapshots.keys()) {
      snapshots.delete(oldest)
      break
    }
  }
  return { stamp, rows, status: 'miss' }
}

async function loadRounds(db: D1Database) {
  return (await db.prepare(`${ROUNDS} ORDER BY r.id DESC`).all<QuestionRound>()).results
}

type QuestionState = { roundId: number; section: QuestionRound['section']; revision: number; questions: SharedQuestion[] }

export async function loadSharedQuestions(db: D1Database, roundId: number | null): Promise<QuestionState | null> {
  const round = roundId === null ? '(SELECT id FROM meetup15_qa_rounds WHERE closed_at IS NULL)' : '?'
  const bindings = roundId === null ? [] : [roundId]
  const [metadata, questions, likes] = await db.batch([
    db.prepare(`
      SELECT r.id AS roundId, r.section, a.question_revision AS revision
      FROM meetup15_qa_rounds r CROSS JOIN activity_state a WHERE r.id = ${round} AND a.id = 1
    `).bind(...bindings),
    db.prepare(`
      SELECT ${ITEM_CONTENT}
      FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
      WHERE d.round_id = ${round}
    `).bind(...bindings),
    db.prepare(`
      SELECT l.item_id AS itemId, l.member_id AS memberId
      FROM meetup15_discussion d JOIN meetup15_discussion_likes l ON l.item_id = d.id
      WHERE d.round_id = ${round}
    `).bind(...bindings),
  ])
  const state = metadata.results[0] as Omit<QuestionState, 'questions'> | undefined
  if (!state) return null
  const byQuestion = new Map<number, Set<string>>()
  for (const { itemId, memberId } of likes.results as { itemId: number; memberId: string }[]) {
    const likedBy = byQuestion.get(itemId) ?? new Set<string>()
    likedBy.add(memberId)
    byQuestion.set(itemId, likedBy)
  }
  const rows = (questions.results as QuestionContentRow[]).map(row => {
    const likedBy = byQuestion.get(row.id) ?? new Set<string>()
    return { ...row, tags: JSON.parse(row.tags), answered: Boolean(row.answered), likes: likedBy.size, likedBy }
  }).sort(compareQuestions)
  return { ...state, questions: rows }
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

async function loadSharedPosts(db: D1Database, section: string, cursor: number): Promise<SharedPost[]> {
  const { results } = await db.prepare(`
    SELECT ${ITEM_CONTENT},
      (SELECT COUNT(*) FROM meetup15_discussion r WHERE r.post_id = d.id) AS replyCount,
      (SELECT json_group_array(l.member_id) FROM meetup15_discussion_likes l WHERE l.item_id = d.id) AS likeMembers,
      (SELECT json_group_array(json_object('emoji', emoji, 'members', json(members)))
       FROM (
         SELECT emoji, json_group_array(member_id) AS members
         FROM meetup15_reply_reactions WHERE reply_id = d.id GROUP BY emoji
       )) AS reactionMembers
    FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
    WHERE d.kind = 'post' AND d.section = ? AND d.id < ?
    ORDER BY d.id DESC LIMIT ?`
  ).bind(section, cursor, PAGE_SIZE + 1).all<QuestionContentRow & { likeMembers: string; reactionMembers: string }>()
  return results.map(({ likeMembers, reactionMembers, ...row }) => {
    const likedBy = new Set<string>(JSON.parse(likeMembers))
    return { ...row, tags: JSON.parse(row.tags), answered: Boolean(row.answered),
      likes: likedBy.size, likedBy, reactionsByMember: JSON.parse(reactionMembers) }
  })
}

function version(parts: unknown[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('base64url')
}

function questionToken(viewer: string, round: number, revision: number, stamp: string) {
  return [revision, stamp, version([viewer, round, revision, stamp])].join('.')
}

function parseQuestionToken(token: string | undefined, viewer: string, round: number) {
  if (!token) return null
  const [rawRevision, stamp] = token.split('.')
  const revision = Number(rawRevision)
  if (!stamp || !Number.isSafeInteger(revision) || revision < 0 ||
      token !== questionToken(viewer, round, revision, stamp)) return null
  return { revision, stamp, token }
}

export function questionForViewer({ likedBy, ...question }: SharedQuestion, viewer: string): DiscussionItem {
  return { ...question, mine: question.authorId === viewer, liked: likedBy.has(viewer) }
}

export function questionChanges(previous: SharedQuestion[], current: SharedQuestion[], viewer: string): QuestionDelta {
  const old = new Map(previous.map(question => [question.id, question]))
  const upsert = []
  for (const question of current) {
    const earlier = old.get(question.id)
    old.delete(question.id)
    if (!earlier || earlier.body !== question.body || earlier.author !== question.author ||
        earlier.authorId !== question.authorId || earlier.authorRole !== question.authorRole ||
        earlier.createdAt !== question.createdAt || earlier.answered !== question.answered ||
        earlier.likes !== question.likes || earlier.likedBy.has(viewer) !== question.likedBy.has(viewer)) {
      upsert.push(questionForViewer(question, viewer))
    }
  }
  return { upsert, remove: [...old.keys()] }
}

export async function readFeed(
  db: D1Database, viewer: string, url: URL, now: number, knownVersions: string | null, execution?: ExecutionContext,
) {
  const state = await db.prepare(`
    SELECT m.display_name, a.section_override, a.question_revision, a.post_revision, a.round_revision
    FROM meetup15_members m CROSS JOIN activity_state a WHERE m.id = ? AND a.id = 1
  `).bind(viewer).first<FeedState>()
  if (!state) return null

  const history = sharedSnapshot(roundSnapshots, 'rounds', state.round_revision, () => loadRounds(db), 1, execution)
  const context = discussionContext(state.section_override, await history.rows, now)
  const wantedSection = url.searchParams.get('section')
  const section = isMeetupSection(wantedSection) ? wantedSection : context.currentSection
  const wantedRound = url.searchParams.get('round')
  const viewedRound = wantedRound
    ? context.rounds.find(round => String(round.id) === wantedRound && round.section === section) ?? null
    : context.activeRound?.section === section ? context.activeRound : null
  const before = Number(url.searchParams.get('before'))
  const cursor = Number.isSafeInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER
  const postKey = `${section}:${cursor}`
  const [knownQuestions, knownPosts] = knownVersions?.split(',') ?? []
  const noQuestionsVersion = version([viewer, null])
  const previous = viewedRound ? parseQuestionToken(knownQuestions, viewer, viewedRound.id) : null
  const unchangedQuestions = viewedRound
    ? previous?.revision === state.question_revision : knownQuestions === noQuestionsVersion
  const previousCache = viewedRound && previous && previous.revision < state.question_revision
    ? questionSnapshots.get(`${viewedRound.id}:${previous.revision}`) : undefined
  const questionSnapshot = viewedRound && !unchangedQuestions
    ? sharedSnapshot(questionSnapshots, `${viewedRound.id}:${state.question_revision}`, state.question_revision,
      () => loadSharedQuestions(db, viewedRound.id), 12, execution) : null
  const postVersion = version([viewer, postKey, state.post_revision])
  const postSnapshot = knownPosts !== postVersion
    ? sharedSnapshot(postSnapshots, postKey, state.post_revision, () => loadSharedPosts(db, section, cursor), 32, execution) : null
  const [qa, posts] = await Promise.all([questionSnapshot?.rows, postSnapshot?.rows])
  const qaRevision = viewedRound ? qa?.revision ?? state.question_revision : undefined
  const versions: FeedVersions = {
    questions: viewedRound
      ? questionSnapshot ? questionToken(viewer, viewedRound.id, qaRevision!, questionSnapshot.stamp) : previous!.token
      : noQuestionsVersion,
    posts: postVersion,
  }
  const data: FeedUpdate = {
    ...context, refreshAt: Math.min(context.refreshAt ?? INTERACTION_END, INTERACTION_END),
    nickname: state.display_name, section, viewedRound, versions, qaRevision,
  }
  if (!unchangedQuestions) {
    const current = qa?.questions ?? []
    if (previousCache && previousCache.stamp === previous?.stamp) {
      const old = await previousCache.rows.catch(() => null)
      if (old) {
        const delta = questionChanges(old.questions, current, viewer)
        if (delta.upsert.length + delta.remove.length < current.length) data.questionDelta = delta
      }
    }
    if (!data.questionDelta) data.questions = current.map(question => questionForViewer(question, viewer))
  }
  if (posts) {
    const page = posts.slice(0, PAGE_SIZE)
    data.items = page.map(({ likedBy, reactionsByMember, ...post }) => ({
      ...post, mine: post.authorId === viewer, liked: likedBy.has(viewer),
      reactions: reactionsByMember.map(({ emoji, members }) => ({
        emoji, count: members.length, reacted: members.includes(viewer),
      })),
    }))
    data.nextBefore = posts.length > PAGE_SIZE ? page.at(-1)?.id ?? null : null
  }
  if (knownVersions === null) {
    const full: Partial<FeedUpdate> = { ...data }
    delete full.versions
    return { data: full, cache: { rounds: history.status, questions: questionSnapshot?.status, posts: postSnapshot?.status } }
  }
  return { data, cache: { rounds: history.status, questions: questionSnapshot?.status ?? (unchangedQuestions ? 'unchanged' : 'empty'),
    questionPayload: data.questionDelta ? 'delta' : data.questions ? 'full' : 'unchanged',
    posts: postSnapshot?.status ?? 'unchanged' } }
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
      ${REACTION_DATA}
    FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
    WHERE ${where}
    ORDER BY d.id LIMIT ?`
  ).bind(viewer, viewer, ...range, pageSize + 1).all<ItemRow>()
  const items = results.slice(0, pageSize).map(item)
  return { items, nextAfter: results.length > pageSize ? items.at(-1)?.id ?? null : null, refreshAt: null }
}

export async function readModerationPosts(db: D1Database, url: URL, now: number): Promise<ModerationPage> {
  const section = url.searchParams.get('section')
  const before = Number(url.searchParams.get('before'))
  const cursor = Number.isSafeInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER
  const { results } = await db.prepare(`
    SELECT d.id, m.display_name AS author, d.body, d.created_at AS createdAt,
      (SELECT COUNT(*) FROM meetup15_discussion r WHERE r.post_id = d.id) AS replyCount
    FROM meetup15_discussion d JOIN meetup15_members m ON m.id = d.author_id
    WHERE d.kind = 'post' AND d.section = ? AND d.id < ?
    ORDER BY d.id DESC LIMIT ?
  `).bind(isMeetupSection(section) ? section : 'lounge', cursor, PAGE_SIZE + 1).all<ModerationPage['posts'][number]>()
  const posts = results.slice(0, PAGE_SIZE)
  const canDelete = now < INTERACTION_END
  return { posts, nextBefore: results.length > PAGE_SIZE ? posts.at(-1)?.id ?? null : null,
    canDelete, refreshAt: canDelete ? INTERACTION_END : null }
}

export async function readDiscussionAdmin(db: D1Database, now: number): Promise<StaffSnapshot> {
  const [state, rounds] = await Promise.all([
    db.prepare('SELECT section_override, agenda_start_override FROM activity_state WHERE id = 1')
      .first<{ section_override: unknown; agenda_start_override: string | null }>(),
    loadRounds(db),
  ])
  const context = discussionContext(state?.section_override, rounds, now)
  const questions = await readQuestions(db, context.activeRound, '')
  const agendaStartOverride = state?.agenda_start_override ?? null
  const currentAgendaStart = currentMeetupAgenda(now, context.override, agendaStartOverride)?.start ?? null
  return { ...context, currentAgendaStart, agendaStartOverride,
    refreshAt: nextMeetupAgendaChange(now, context.override, agendaStartOverride),
    viewedRound: context.activeRound, questions }
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
  const [rounds, questions, version] = await db.batch([roundQuery, questionsQuery(db, roundId, ''),
    db.prepare('SELECT question_revision AS qaRevision FROM activity_state WHERE id = 1'),
  ])
  const round = rounds.results[0] as QuestionRound | undefined
  const qaRevision = (version.results[0] as { qaRevision?: number } | undefined)?.qaRevision
  return round ? { round, qaRevision, questions: (questions.results as unknown as ItemRow[]).map(item) } : null
}
