export const RAFFLE_ACTIVE_HOURS = 4
export const RAFFLE_ANIMATION_MS = 5000
export const RAFFLE_WEIGHT_RULE = '每人基础 1 份，发过帖和收到过他人回复各加 1 份。'

export type RaffleRules = { weighted: boolean; requireParticipation: boolean }

export type LotteryScreen =
  | { phase: 'drawing'; readyAt: number; candidateCount: number }
  | { phase: 'winner'; winner: string }
  | { phase: 'empty' }

export type RaffleCandidateView = { name: string; weight: number; won: boolean }
export type RaffleRound = { id: number; finishedAt: number; winner: string | null }

export type RaffleAdminSnapshot = {
  latestId: number
  result: LotteryScreen | null
  refreshAt: number | null
}

export type RaffleCommand = RaffleRules & { action: 'start'; latestId: number }
