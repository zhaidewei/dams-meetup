import type { DiscussionItem, QuestionRound } from './discussion'
import type { LotteryScreen, RaffleCandidateView, RaffleRound } from './raffle'

export const PROJECTION_MODES = {
  hidden: '隐藏大屏',
  agenda: '议程展示',
  qa: '嘉宾问答',
  raffle: '现场抽奖',
} as const

export type ProjectionMode = keyof typeof PROJECTION_MODES
export type ProjectionSelection =
  | { mode: 'hidden' | 'agenda' }
  | { mode: 'raffle'; raffleId?: number }
  | { mode: 'qa'; roundId: number }

export type ProjectionView = { refreshAt: number | null } & (
  | { mode: 'hidden' }
  | { mode: 'agenda'; currentStart: string | null }
  | { mode: 'qa'; round: QuestionRound; questions: DiscussionItem[] }
  | { mode: 'raffle'; lottery: LotteryScreen | null; raffleId: number | null; candidates: RaffleCandidateView[] }
)

export type ProjectionAdminSnapshot = {
  selection: ProjectionSelection
  revision: number
  rounds: QuestionRound[]
  raffleRounds: RaffleRound[]
  refreshAt: null
}

export type ProjectionCommand = ProjectionSelection & { revision: number }
