import type { DiscussionItem, QuestionRound } from './discussion'

export const PROJECTION_MODES = {
  hidden: '隐藏大屏',
  agenda: '议程展示',
  qa: '嘉宾问答',
  raffle: '现场抽奖',
} as const

export type ProjectionMode = keyof typeof PROJECTION_MODES
export type ProjectionSelection =
  | { mode: Exclude<ProjectionMode, 'qa'> }
  | { mode: 'qa'; roundId: number }

export type LotteryScreen = { phase: 'drawing' } | { phase: 'winner'; winner: string }

export type ProjectionView = { refreshAt: number | null } & (
  | { mode: 'hidden' }
  | { mode: 'agenda'; currentStart: string | null }
  | { mode: 'qa'; round: QuestionRound; questions: DiscussionItem[] }
  | { mode: 'raffle'; lottery: LotteryScreen | null }
)

export type ProjectionAdminSnapshot = {
  selection: ProjectionSelection
  revision: number
  rounds: QuestionRound[]
  refreshAt: null
}

export type ProjectionCommand = ProjectionSelection & { revision: number }
