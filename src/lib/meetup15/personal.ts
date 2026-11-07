import type { MeetupSection } from './event'

export const MAX_CONTACT_LENGTH = 200
export const MAX_NICKNAME_LENGTH = 48

export type PersonalItem = {
  id: number
  section: MeetupSection
  body: string
  author: string
  unread: number
}

export type ThreadSummary = {
  id: number
  contactId: string | null
  name: string
  system: number
  body: string
  latestId: number
  unread: number
}

export type Message = { id: number; body: string; mine: number; unread: number }

export type PersonalSnapshot = {
  nickname: string | null
  contact: string | null
  contactPublic: boolean
  profileRevision: number
  posts: PersonalItem[]
  replies: PersonalItem[]
  threads: ThreadSummary[]
  refreshAt: null
}

export type MemberCard = { name: string; contact: string | null; named: boolean; refreshAt: null }
export type ThreadSnapshot = { name: string; named: boolean; system: boolean; messages: Message[]; nextBefore: number | null; refreshAt: null }

export type PersonalCommand =
  | { action: 'profile'; name: string; contact: string; contactPublic: boolean; revision: number }
  | { action: 'replies-read'; through: number }
  | { action: 'send'; body: string }
  | { action: 'thread-read'; through: number }
  | { action: 'thread-delete'; through: number }
