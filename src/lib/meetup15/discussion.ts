import type { MeetupAgendaSection, MeetupSection } from './event'
import type { Member } from './identity'

export const MAX_DISCUSSION_BODY = 300
export const MAX_QUESTION_BODY = 100

export const DISCUSSION_EMOJIS = [
  ['👍', '赞'], ['❤️', '喜欢'], ['😂', '大笑'], ['😮', '惊讶'], ['😢', '难过'], ['🙏', '感谢'],
  ['🎉', '庆祝'], ['👏', '鼓掌'], ['🔥', '精彩'], ['💡', '好点子'], ['🤔', '思考'],
  ['🙌', '赞同'], ['😊', '微笑'], ['👀', '关注'], ['💯', '满分'], ['🚀', '起飞'],
  ['😀', '开心'], ['🤣', '笑翻'], ['😍', '喜爱'], ['🥰', '暖心'], ['😎', '酷'],
  ['😉', '眨眼'], ['😅', '苦笑'], ['😭', '大哭'], ['😱', '震惊'], ['😡', '生气'],
  ['🤩', '太棒了'], ['🤯', '大开眼界'], ['🫡', '致敬'], ['🤝', '握手'], ['💪', '加油'],
  ['👌', '没问题'], ['✅', '同意'], ['⭐', '星标'], ['✨', '闪亮'], ['💬', '想聊聊'],
] as const

export type DiscussionEmoji = (typeof DISCUSSION_EMOJIS)[number][0]
export type DiscussionReaction = { emoji: DiscussionEmoji; count: number; reacted: boolean }

export type DiscussionItem = {
  id: number
  kind: 'post' | 'reply' | 'question'
  author: string
  authorId: string
  authorRole: Member['role']
  mine: boolean
  body: string
  tags: string[]
  postId: number | null
  parentId: number | null
  answered: boolean
  likes: number
  liked: boolean
  replyCount?: number
  reactions?: DiscussionReaction[]
  createdAt: number
}

export function compareQuestions(a: Omit<DiscussionItem, 'mine' | 'liked'>, b: Omit<DiscussionItem, 'mine' | 'liked'>) {
  return Number(a.answered) - Number(b.answered) || b.likes - a.likes ||
    a.createdAt - b.createdAt || a.id - b.id
}

export type QuestionRound = {
  id: number
  guest: string
  section: MeetupSection
  openedAt: number
  closedAt: number | null
}

export type DiscussionContext = {
  currentSection: MeetupAgendaSection
  override: MeetupAgendaSection | null
  refreshAt: number | null
  rounds: QuestionRound[]
  activeRound: QuestionRound | null
  viewedRound: QuestionRound | null
  questions: DiscussionItem[]
}

export type FeedSnapshot = DiscussionContext & {
  nickname: string | null
  section: MeetupSection
  items: DiscussionItem[]
  nextBefore: number | null
  qaRevision?: number
}

export const FEED_VERSIONS_HEADER = 'X-Discussion-Versions'
export const FEED_TIME_HEADER = 'X-Discussion-Server-Time'
export type FeedVersions = { questions: string; posts: string }
export type VersionedFeed = FeedSnapshot & { versions: FeedVersions }
export type QuestionDelta = { upsert: DiscussionItem[]; remove: number[] }
export type QaPush = {
  type: 'qa.updated'
  section: MeetupSection
  roundId: number
  revision: number
  baseRevision: number | null
} & QuestionDelta

export type QaWriteAck = { revision: number; roundId: number } & (
  | { question: DiscussionItem }
  | { like: { id: number; liked: boolean } }
)

export function mergeQuestions(questions: DiscussionItem[], delta: QuestionDelta) {
  const merged = new Map(questions.map(question => [question.id, question]))
  for (const id of delta.remove) merged.delete(id)
  for (const question of delta.upsert) merged.set(question.id, question)
  return [...merged.values()].sort(compareQuestions)
}

export type FeedUpdate = { questionDelta?: QuestionDelta } & Omit<VersionedFeed, 'items' | 'questions' | 'nextBefore'> &
  Partial<Pick<VersionedFeed, 'items' | 'questions' | 'nextBefore'>>

export type ReplyPage = { items: DiscussionItem[]; nextAfter: number | null; refreshAt: null }

export type ModerationPage = {
  posts: (Pick<DiscussionItem, 'id' | 'author' | 'body' | 'createdAt'> & { replyCount: number })[]
  nextBefore: number | null
  canDelete: boolean
  refreshAt: number | null
}

export type StaffSnapshot = DiscussionContext & {
  guests: { id: string; name: string }[]
  currentAgendaStart: string | null
  agendaStartOverride: string | null
}

export type MemberCommand =
  | { action: 'nickname'; name: string }
  | { action: 'post'; section: MeetupSection; body: string; tags: string }
  | { action: 'reply'; postId: number; parentId: number | null; body: string }
  | { action: 'edit'; id: number; body: string; tags: string }
  | { action: 'delete'; id: number }
  | { action: 'reaction'; id: number; emoji: DiscussionEmoji; reacted: boolean }
  | { action: 'like'; id: number; liked: boolean }
  | { action: 'question'; section: MeetupSection; roundId: number; body: string }

export type StaffCommand =
  | { action: 'section'; section: MeetupAgendaSection | null }
  | { action: 'agenda'; start: string | null }
  | { action: 'start'; guestId: string; activeRoundId: number | null; latestRoundId: number | null }
  | { action: 'end'; roundId: number }
  | { action: 'answer'; id: number; answered: boolean }
