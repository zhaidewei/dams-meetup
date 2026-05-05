import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import type { LotteryRules, PublicUserDisplay } from '@/lib/types'

type LotteryUserMini = Pick<
  PublicUserDisplay,
  'id' | 'nickname' | 'company' | 'is_vip' | 'vip_name' | 'vip_title'
>

export type ScreenLotteryDraw = {
  id: number
  rules: LotteryRules
  winner: LotteryUserMini
  // 动画用的候选池采样（最多 30 个 user，前端动画卡格够用）。
  // 已经包含 winner，前端不需要单独保证。
  pool_sample: LotteryUserMini[]
  created_at: string
}

const POOL_SAMPLE_SIZE = 30

// /screen 在 mode='lottery' 时调用。把抽奖行 + 中奖人 + 一组动画用 user
// profile 一起拿出来。失败返回 null（/screen 会回落到 default）。
export async function fetchLotteryDraw(
  drawId: number,
): Promise<ScreenLotteryDraw | null> {
  const sb = getServerSupabase()

  const { data: draw, error: drawErr } = await sb
    .from('lottery_draws')
    .select('id, rules, pool_user_ids, winner_user_id, created_at')
    .eq('id', drawId)
    .maybeSingle()
  if (drawErr || !draw) return null

  const pool = (draw.pool_user_ids as string[]) ?? []
  const winnerId = draw.winner_user_id as string

  // Sample up to N from pool, ensure winner is included
  const sampleIds = sampleWithGuarantee(pool, POOL_SAMPLE_SIZE, winnerId)

  const { data: users, error: usersErr } = await sb
    .from('users')
    .select('id, nickname, company, is_vip, vip_name, vip_title')
    .in('id', sampleIds)
  if (usersErr || !users) return null

  const byId = new Map<string, LotteryUserMini>()
  for (const u of users) {
    byId.set(u.id as string, u as LotteryUserMini)
  }

  const winner = byId.get(winnerId)
  if (!winner) return null

  const pool_sample = sampleIds
    .map((id) => byId.get(id))
    .filter((u): u is LotteryUserMini => Boolean(u))

  return {
    id: draw.id as number,
    rules: (draw.rules as LotteryRules) ?? {
      must_have_posted: false,
      exclude_previous_winners: true,
    },
    winner,
    pool_sample,
    created_at: draw.created_at as string,
  }
}

function sampleWithGuarantee(arr: string[], n: number, mustInclude: string): string[] {
  if (arr.length <= n) {
    return Array.from(new Set(arr.concat([mustInclude])))
  }
  // Fisher-Yates partial shuffle
  const a = arr.slice()
  for (let i = a.length - 1; i > a.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  const sampled = a.slice(a.length - n)
  if (!sampled.includes(mustInclude)) {
    // Replace one slot with the winner so animation always has a chance to land on them
    sampled[0] = mustInclude
  }
  return Array.from(new Set(sampled))
}
