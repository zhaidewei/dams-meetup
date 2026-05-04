import 'server-only'
import type { UserRow } from '@/lib/types'
import { fetchUnreadDmCount } from './dm'
import { fetchUnreadRepliesCount } from './me'

export type UnreadMeBreakdown = {
  dm: number
  replies: number
  total: number
}

// Header「我」tab 红点合计 + 各分项：DM 未读 + 未读回复。
// DM 自身有 read_at 机制；回复用 users.last_seen_me_at 作为基线。
export async function fetchUnreadMe(user: UserRow): Promise<UnreadMeBreakdown> {
  const [dm, replies] = await Promise.all([
    fetchUnreadDmCount(user.id),
    fetchUnreadRepliesCount(user.id, user.last_seen_me_at),
  ])
  return { dm, replies, total: dm + replies }
}
