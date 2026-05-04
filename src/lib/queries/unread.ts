import 'server-only'
import type { UserRow } from '@/lib/types'
import { fetchUnreadDmCount } from './dm'
import { fetchUnreadRepliesCount, fetchUnreadMentionsCount } from './me'

export type UnreadMeBreakdown = {
  dm: number
  replies: number
  mentions: number
  total: number
}

// Header「我」tab 红点合计 + 各分项：DM 未读 + 未读回复 + 未读 AI 提及。
// DM 自身有 read_at 机制；回复 + 提及共用 users.last_seen_me_at 作为基线。
export async function fetchUnreadMe(user: UserRow): Promise<UnreadMeBreakdown> {
  const [dm, replies, mentions] = await Promise.all([
    fetchUnreadDmCount(user.id),
    fetchUnreadRepliesCount(user.id, user.last_seen_me_at),
    fetchUnreadMentionsCount(user.id, user.last_seen_me_at),
  ])
  return { dm, replies, mentions, total: dm + replies + mentions }
}
