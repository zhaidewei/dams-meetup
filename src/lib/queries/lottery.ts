import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import type { LotteryRules, PublicUserDisplay } from '@/lib/types'

type LotteryUserMini = Pick<
  PublicUserDisplay,
  'id' | 'nickname' | 'company' | 'is_vip' | 'vip_name' | 'vip_title'
>

// v2 含 closed_at（区分 spinning / settled） + pool_size + seed_short（审计行）
export type ScreenLotteryDraw = {
  id: number
  rules: LotteryRules
  // null = 还在转（A/B 阶段）；非 null = 已揭晓（C 阶段）
  winner: LotteryUserMini | null
  // 动画用候选采样（v2：A 阶段全员预览/B 阶段跑马灯都用同一份）
  pool_sample: LotteryUserMini[]
  pool_size: number
  // bytea 前 8 hex 字符；底部审计行展示
  seed_short: string | null
  created_at: string
  closed_at: string | null
}

const POOL_SAMPLE_SIZE = 60 // v2 比 v1 大一倍 —— 候选预览要给观众看到更多人

export async function fetchLotteryDraw(
  drawId: number,
): Promise<ScreenLotteryDraw | null> {
  const sb = getServerSupabase()

  const { data: draw, error: drawErr } = await sb
    .from('lottery_draws')
    .select(
      'id, rules, pool_user_ids, winner_user_id, random_seed, created_at, closed_at',
    )
    .eq('id', drawId)
    .maybeSingle()
  if (drawErr || !draw) return null

  const pool = (draw.pool_user_ids as string[]) ?? []
  const winnerId = (draw.winner_user_id as string | null) ?? null

  // 采样 N 人。winner 已知则保证在采样里（揭晓时定格用）；未揭晓
  // （v2 startLottery 后、resolve 前）就纯随机采样即可。
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

  const winner = winnerId ? byId.get(winnerId) ?? null : null
  const pool_sample = sampleIds
    .map((id) => byId.get(id))
    .filter((u): u is LotteryUserMini => Boolean(u))

  // bytea 在 supabase-js 里以 \x 开头的 hex string 返回；切前 8 hex 给审计行
  const rawSeed = (draw.random_seed as string | null) ?? null
  const seed_short = rawSeed ? rawSeed.replace(/^\\x/, '').slice(0, 8) : null

  return {
    id: draw.id as number,
    rules: (draw.rules as LotteryRules) ?? {
      must_have_posted: false,
      exclude_previous_winners: true,
    },
    winner,
    pool_sample,
    pool_size: pool.length,
    seed_short,
    created_at: draw.created_at as string,
    closed_at: (draw.closed_at as string | null) ?? null,
  }
}

function sampleWithGuarantee(
  arr: string[],
  n: number,
  mustInclude: string | null,
): string[] {
  if (arr.length <= n) {
    return mustInclude
      ? Array.from(new Set(arr.concat([mustInclude])))
      : Array.from(new Set(arr))
  }
  const a = arr.slice()
  for (let i = a.length - 1; i > a.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  const sampled = a.slice(a.length - n)
  if (mustInclude && !sampled.includes(mustInclude)) {
    sampled[0] = mustInclude
  }
  return Array.from(new Set(sampled))
}
