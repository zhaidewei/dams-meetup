import type { MeetupSection } from './event'

export const MAX_CONTACT_LENGTH = 200
export const MAX_NICKNAME_LENGTH = 48
export const COMPANY_FIELD = { key: 'company', label: '工作单位', type: 'text', maxLength: 100, autoComplete: 'organization' } as const
const GUEST_TITLE_FIELD = { key: 'title', label: '职位', type: 'text', maxLength: 120, autoComplete: 'organization-title' } as const

export const PROFILE_FIELDS = [
  COMPANY_FIELD,
  GUEST_TITLE_FIELD,
  { key: 'wechat', label: '微信号', type: 'text', maxLength: 64, autoComplete: 'off' },
  { key: 'linkedin', label: 'LinkedIn', type: 'url', maxLength: 200, autoComplete: 'url' },
  { key: 'phone', label: '手机', type: 'tel', maxLength: 40, autoComplete: 'tel' },
  { key: 'email', label: '邮箱', type: 'email', maxLength: 200, autoComplete: 'email' },
] as const

export function editableProfileFields(guest: boolean) {
  return PROFILE_FIELDS.filter(field => guest || field.key !== 'title')
}

export type PublicProfile = Partial<Record<(typeof PROFILE_FIELDS)[number]['key'], string>>

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
  guest: boolean
  contact: string | null
  contactPublic: boolean
  publicProfile: PublicProfile
  profileRevision: number
  posts: PersonalItem[]
  replies: PersonalItem[]
  threads: ThreadSummary[]
  refreshAt: null
}

export type MemberCard = { name: string; contact: string | null; publicProfile: PublicProfile; named: boolean; refreshAt: null }
export type ThreadSnapshot = { name: string; named: boolean; system: boolean; messages: Message[]; nextBefore: number | null; refreshAt: null }

export type PersonalCommand =
  | { action: 'profile'; name: string; publicProfile: PublicProfile; removeLegacyContact: boolean; revision: number }
  | { action: 'replies-read'; through: number }
  | { action: 'send'; body: string }
  | { action: 'thread-read'; through: number }
  | { action: 'thread-delete'; through: number }
