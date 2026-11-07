import type { StaffSnapshot } from './discussion'
import type { MeetupSection } from './event'

export type PollUpdate = `poll.updated:${MeetupSection}` | 'screen.updated'

export type Poll = {
  id: number
  title: string
  section: MeetupSection
  author: string
  mine: boolean
  multiple: boolean
  hidden: boolean
  deadline: number
  closed: boolean
  options: string[]
  counts: number[] | null
  ballot: number[]
  voters: number
}

export type PollCommand =
  | { action: 'create'; section: MeetupSection; title: string; options: string[]; multiple: boolean; hidden: boolean }
  | { action: 'vote'; id: number; choices: number[] }
  | { action: 'close'; id: number }

export type ScreenCommand =
  | { action: 'intro' | 'live' }
  | { action: 'filter'; section: MeetupSection | null }
  | { action: 'reveal'; id: number }

export type PollFeedSnapshot = { polls: Poll[]; canCreate: boolean; canVote: boolean; refreshAt: number | null }
export type PollAdminSnapshot = {
  mode: 'intro' | 'live'
  filter: MeetupSection | null
  revealed: number | null
  revealable: Pick<Poll, 'id' | 'title' | 'section'>[]
  refreshAt: number | null
}
export type LotteryScreen = { phase: 'drawing' } | { phase: 'winner'; winner: string }
export type ScreenSnapshot = {
  refreshAt: number | null
  agenda: string
  online: number
} & (
  | { mode: 'intro' }
  | { mode: 'reveal'; poll: Poll }
  | { mode: 'lottery'; lottery: LotteryScreen }
  | { mode: 'qa'; round: NonNullable<StaffSnapshot['activeRound']>; questions: StaffSnapshot['questions'] }
  | { mode: 'live'; polls: Poll[] }
)
