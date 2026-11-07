export type LotteryScreen =
  | { phase: 'drawing'; readyAt: number; candidateCount: number }
  | { phase: 'winner'; winner: string }
  | { phase: 'empty' }

export type RaffleAdminSnapshot = {
  latestId: number
  result: LotteryScreen | null
  refreshAt: number | null
}

export type RaffleCommand = { action: 'start'; weighted: boolean; requireParticipation: boolean; latestId: number }
