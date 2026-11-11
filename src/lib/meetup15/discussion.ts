import type { MeetupSection } from './event'

export const MAX_DISCUSSION_BODY = 300

export const DISCUSSION_EMOJIS = [
  ['👍', '赞'], ['❤️', '喜欢'], ['😂', '大笑'], ['😮', '惊讶'], ['😢', '难过'], ['🙏', '感谢'],
  ['🎉', '庆祝'], ['👏', '鼓掌'], ['🔥', '精彩'], ['💡', '好点子'], ['🤔', '思考'],
  ['🙌', '赞同'], ['😊', '微笑'], ['👀', '关注'], ['💯', '满分'], ['🚀', '起飞'],
] as const

export type DiscussionEmoji = (typeof DISCUSSION_EMOJIS)[number][0]
export type DiscussionReaction = { emoji: DiscussionEmoji; count: number; reacted: boolean }

export type DiscussionItem = {
  id: number
  kind: 'post' | 'reply' | 'question'
  author: string
  authorId: string
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

export type QuestionRound = {
  id: number
  guest: string
  section: MeetupSection
  openedAt: number
  closedAt: number | null
}

export type DiscussionContext = {
  currentSection: MeetupSection
  override: MeetupSection | null
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
}

export type ReplyPage = { items: DiscussionItem[]; nextAfter: number | null; refreshAt: null }

export type ModerationPage = {
  posts: (Pick<DiscussionItem, 'id' | 'author' | 'body' | 'createdAt'> & { replyCount: number })[]
  nextBefore: number | null
  refreshAt: null
}

export type StaffSnapshot = DiscussionContext & {
  guests: { id: string; name: string }[]
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
  | { action: 'section'; section: MeetupSection | null }
  | { action: 'start'; guestId: string; activeRoundId: number | null; latestRoundId: number | null }
  | { action: 'end'; roundId: number }
  | { action: 'answer'; id: number; answered: boolean }
