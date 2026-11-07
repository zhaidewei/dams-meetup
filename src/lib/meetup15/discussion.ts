import type { MeetupSection } from './event'

export const MAX_DISCUSSION_BODY = 300

export type DiscussionItem = {
  id: number
  kind: 'post' | 'reply' | 'question'
  author: string
  mine: boolean
  body: string
  tags: string[]
  postId: number | null
  parentId: number | null
  answered: boolean
  likes: number
  liked: boolean
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

export type StaffSnapshot = DiscussionContext & {
  guests: { id: string; name: string }[]
}

export type MemberCommand =
  | { action: 'nickname'; name: string }
  | { action: 'post'; section: MeetupSection; body: string; tags: string }
  | { action: 'reply'; postId: number; parentId: number | null; body: string }
  | { action: 'edit'; id: number; body: string; tags: string }
  | { action: 'delete'; id: number }
  | { action: 'like'; id: number; liked: boolean }
  | { action: 'question'; section: MeetupSection; roundId: number; body: string }

export type StaffCommand =
  | { action: 'section'; section: MeetupSection | null }
  | { action: 'start'; guestId: string; activeRoundId: number | null; latestRoundId: number | null }
  | { action: 'end'; roundId: number }
  | { action: 'answer'; id: number; answered: boolean }
