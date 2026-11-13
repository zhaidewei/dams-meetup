import type { DiscussionItem, QuestionRound } from './discussion'
import type { LotteryScreen, RaffleCandidateView, RaffleRound, RaffleRules } from './raffle'

export const PROJECTION_MODES = {
  opening: '开场介绍',
  agenda: '议程展示',
  qa: '问答',
  raffle: '现场抽奖',
} as const

export const OPENING_SLIDE_COUNT = 9

export type ProjectionMode = keyof typeof PROJECTION_MODES
export type ProjectionSelection =
  | { mode: 'agenda' }
  | { mode: 'opening'; slide: number }
  | { mode: 'raffle'; raffleId?: number }
  | { mode: 'qa'; roundId: number }

export type ProjectionView = { refreshAt: number | null } & (
  | { mode: 'opening'; slide: number; revision: number }
  | { mode: 'agenda'; currentStart: string | null }
  | { mode: 'qa'; round: QuestionRound; questions: DiscussionItem[]; qaRevision?: number }
  | { mode: 'raffle'; lottery: LotteryScreen | null; raffleId: number | null; candidates: RaffleCandidateView[]; rules: RaffleRules | null }
)

export type ProjectionAdminSnapshot = {
  selection: ProjectionSelection
  revision: number
  rounds: QuestionRound[]
  raffleRounds: RaffleRound[]
  refreshAt: null
}

export type ProjectionCommand = (Exclude<ProjectionSelection, { mode: 'opening' }> | { mode: 'opening'; slide?: number }) & { revision: number }
