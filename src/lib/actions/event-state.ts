'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '@/lib/supabase/server'
import { readAdminCookie } from '@/lib/identity'
import { isSectionId, type SectionId } from '@/lib/sections'
import { EVENT_END_ISO } from '@/lib/constants'

// 主办方手动覆写当前板块。覆写有效期延伸到活动结束（一般主办方一场切一次就走人）。
// 鉴权：admin cookie。
export async function setCurrentSectionAction(
  section: SectionId,
): Promise<{ error: string | null }> {
  if (!(await readAdminCookie())) return { error: '未授权' }
  if (!isSectionId(section)) return { error: '无效的板块' }

  const sb = getServerSupabase()
  const { error } = await sb
    .from('event_state')
    .update({
      current_section: section,
      override_until: EVENT_END_ISO,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return { error: error.message }
  revalidatePath('/screen')
  revalidatePath('/feed')
  return { error: null }
}

// 清除覆写 → 回落到议程时间表。
export async function clearCurrentSectionAction(): Promise<{ error: string | null }> {
  if (!(await readAdminCookie())) return { error: '未授权' }

  const sb = getServerSupabase()
  const { error } = await sb
    .from('event_state')
    .update({
      current_section: null,
      override_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return { error: error.message }
  revalidatePath('/screen')
  revalidatePath('/feed')
  return { error: null }
}

// =====================================================================
// screen_mode (issue #27) — admin 控制 QA / lottery / default
// =====================================================================

// 进入 QA 模式：指定一个 VIP 作为被提问的嘉宾。
export async function startQaAction(
  hostUserId: string,
): Promise<{ error: string | null }> {
  if (!(await readAdminCookie())) return { error: '未授权' }
  if (!hostUserId) return { error: '请先选择嘉宾' }

  const sb = getServerSupabase()

  // 校验该 user 确实是 VIP（防止误传普通 user 进 QA host 字段）
  const { data: host, error: hostErr } = await sb
    .from('users')
    .select('id, is_vip')
    .eq('id', hostUserId)
    .maybeSingle()
  if (hostErr) return { error: hostErr.message }
  if (!host || !host.is_vip) return { error: '该用户不是嘉宾' }

  const { error } = await sb
    .from('event_state')
    .update({
      screen_mode: 'qa',
      qa_host_user_id: hostUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return { error: error.message }
  revalidatePath('/screen')
  revalidatePath('/feed')
  return { error: null }
}

// 退出 QA / lottery，回到 default 骨架。
export async function exitScreenModeAction(): Promise<{ error: string | null }> {
  if (!(await readAdminCookie())) return { error: '未授权' }

  const sb = getServerSupabase()
  const { error } = await sb
    .from('event_state')
    .update({
      screen_mode: 'default',
      qa_host_user_id: null,
      lottery_draw_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return { error: error.message }
  revalidatePath('/screen')
  revalidatePath('/feed')
  return { error: null }
}

// =====================================================================
// 抽奖 (issue #27)
// =====================================================================
const ONLINE_WINDOW_MS = 5 * 60 * 1000

export type LotteryRulesInput = {
  must_have_posted?: boolean
  exclude_previous_winners?: boolean
}

// 开始一轮抽奖。winner 在服务端选好（防作弊）；前端只播动画。
export async function startLotteryAction(
  rulesIn: LotteryRulesInput,
): Promise<{ error: string | null }> {
  if (!(await readAdminCookie())) return { error: '未授权' }

  const rules = {
    must_have_posted: !!rulesIn.must_have_posted,
    exclude_previous_winners: rulesIn.exclude_previous_winners ?? true,
  }

  const sb = getServerSupabase()
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()

  // 1. 在线用户（last_seen_at 5min 内）
  const { data: onlineUsers, error: onlineErr } = await sb
    .from('users')
    .select('id')
    .gte('last_seen_at', cutoff)
  if (onlineErr) return { error: onlineErr.message }
  let pool = (onlineUsers ?? []).map((u) => u.id as string)
  if (pool.length === 0) return { error: '当前没有在线参与者' }

  // 2. must_have_posted: 至少发过一帖（任何 type）
  if (rules.must_have_posted) {
    const { data: posters } = await sb
      .from('posts')
      .select('user_id')
      .in('user_id', pool)
    const posterSet = new Set((posters ?? []).map((p) => p.user_id as string))
    pool = pool.filter((id) => posterSet.has(id))
    if (pool.length === 0) return { error: '没有满足「必须发过帖」的在线参与者' }
  }

  // 3. exclude_previous_winners: 历次中奖人都剔除
  if (rules.exclude_previous_winners) {
    const { data: prev } = await sb.from('lottery_draws').select('winner_user_id')
    const winnerSet = new Set((prev ?? []).map((p) => p.winner_user_id as string))
    pool = pool.filter((id) => !winnerSet.has(id))
    if (pool.length === 0) return { error: '所有满足条件的人都中过奖了，换个规则？' }
  }

  // 4. 随机选 winner
  const winner = pool[Math.floor(Math.random() * pool.length)]

  // 5. 写 lottery_draws
  const { data: draw, error: drawErr } = await sb
    .from('lottery_draws')
    .insert({
      rules,
      pool_user_ids: pool,
      winner_user_id: winner,
    })
    .select('id')
    .single()
  if (drawErr) return { error: drawErr.message }

  // 6. 切 event_state；先清 qa_host 防止 mode_consistency 约束失败
  const { error: stateErr } = await sb
    .from('event_state')
    .update({
      screen_mode: 'lottery',
      qa_host_user_id: null,
      lottery_draw_id: draw.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
  if (stateErr) return { error: stateErr.message }

  revalidatePath('/screen')
  return { error: null }
}
