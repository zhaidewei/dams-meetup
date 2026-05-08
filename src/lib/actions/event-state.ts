'use server'

import { revalidatePath } from 'next/cache'
import { getServerSupabase } from '@/lib/supabase/server'
import { readAdminCookie } from '@/lib/identity'
import { DEFAULT_SECTION, isSectionId, type SectionId } from '@/lib/sections'
import { EVENT_END_ISO } from '@/lib/constants'
import { getCurrentSection } from '@/lib/queries/event-state'

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

// 大屏视图筛选（issue #45）— 主办方在 /admin 选择"放大看哪个板块"。
// null = 显示全部。仅影响 /screen 显示的帖子集合，不影响 /feed、不影响 LIVE 红标。
export async function setScreenFilterAction(
  section: SectionId | null,
): Promise<{ error: string | null }> {
  if (!(await readAdminCookie())) return { error: '未授权' }
  if (section !== null && !isSectionId(section)) return { error: '无效的板块' }

  const sb = getServerSupabase()
  const { error } = await sb
    .from('event_state')
    .update({
      screen_filter_section: section,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return { error: error.message }
  revalidatePath('/screen')
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

  // 把当前 LIVE section 快照成 qa_section，绑定本轮 QA。
  // 没有 LIVE section（活动外 / 空档期）时归到公共讨论区 lounge，避免 QA 区块在所有
  // section 下都出现。
  const qaSection = (await getCurrentSection()) ?? DEFAULT_SECTION

  const { error } = await sb
    .from('event_state')
    .update({
      screen_mode: 'qa',
      qa_host_user_id: hostUserId,
      qa_section: qaSection,
      lottery_draw_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return { error: error.message }
  revalidatePath('/screen')
  revalidatePath('/feed')
  return { error: null }
}

// 退出 QA / lottery，回到 default 骨架。
// QA 结束时把当前 host + section 搬到 last_qa_*，给 /feed「上一轮 QA」
// 塌陷区块用。lottery 结束不做归档（中奖人由 lottery_draws 表保留）。
export async function exitScreenModeAction(): Promise<{ error: string | null }> {
  if (!(await readAdminCookie())) return { error: '未授权' }

  const sb = getServerSupabase()
  const { data: cur } = await sb
    .from('event_state')
    .select('screen_mode, qa_host_user_id, qa_section')
    .eq('id', 1)
    .maybeSingle()

  const updates: Record<string, unknown> = {
    screen_mode: 'default',
    qa_host_user_id: null,
    qa_section: null,
    lottery_draw_id: null,
    updated_at: new Date().toISOString(),
  }
  if (cur?.screen_mode === 'qa' && cur.qa_host_user_id) {
    updates.last_qa_host_user_id = cur.qa_host_user_id
    updates.last_qa_section = cur.qa_section ?? null
  }

  const { error } = await sb.from('event_state').update(updates).eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/screen')
  revalidatePath('/feed')
  return { error: null }
}

// =====================================================================
// 抽奖 v2 (docs/lottery-design-v2.md)
// =====================================================================
// 与 v1 关键差异：
//   - winner 不再在 startLotteryAction 当下选定，先写 winner=null
//   - pool + 权重交给 RPC compute_lottery_pool（DB 一次算完）
//   - 真正落 winner 在 resolveLotteryAction（动画停帧时由大屏调用）

import { randomBytes, randomInt } from 'node:crypto'
import { canonicalPair } from '@/lib/dm'
import { LOTTERY_NOTIFY_HANDLE } from '@/lib/constants'

const ONLINE_WINDOW_SECONDS = 3600 // 1 小时。v1 是 5min（太严，走神被踢）；
// 早期 v2 设过 10min 仍然激进 —— 现场容易出现 seed 后过 11min 才点抽奖
// 池子空了的窘境。1h 覆盖整个活动 4-5 小时里的"绝大多数活跃成员"。

export type LotteryRulesInput = {
  must_have_posted?: boolean
  exclude_previous_winners?: boolean
  exclude_vips?: boolean
  enable_weights?: boolean
}

// 阶段 1：开抽。冻结 pool + 权重快照，winner_user_id 先留 null。
// 大屏接收 broadcast 进入 A/B 阶段动画；动画停帧时调 resolveLotteryAction。
export async function startLotteryAction(
  rulesIn: LotteryRulesInput,
): Promise<{ error: string | null }> {
  if (!(await readAdminCookie())) return { error: '未授权' }

  const rules = {
    must_have_posted: !!rulesIn.must_have_posted,
    exclude_previous_winners: rulesIn.exclude_previous_winners ?? true,
    exclude_vips: rulesIn.exclude_vips ?? true,
    enable_weights: rulesIn.enable_weights ?? true,
    online_window_seconds: ONLINE_WINDOW_SECONDS,
  }

  const sb = getServerSupabase()

  // 1. RPC 一次算完 pool + 权重
  const { data: poolRows, error: poolErr } = await sb.rpc('compute_lottery_pool', { rules })
  if (poolErr) return { error: poolErr.message }
  const pool = (poolRows ?? []) as Array<{ user_id: string; weight: number }>
  if (pool.length === 0) return { error: '没有满足条件的在线参与者，调整规则后再试' }

  // 2. 拆成 pool_user_ids + pool_weights（schema 兼容 + 权重审计）
  const poolUserIds = pool.map((r) => r.user_id)
  const poolWeights: Record<string, number> = {}
  for (const r of pool) poolWeights[r.user_id] = r.weight

  // 3. 生成 random_seed（事后审计可复现；本身不参与 winner 选择）
  const seed = randomBytes(16)

  // 4. 写 lottery_draws —— winner_user_id=null + closed_at=null，等 resolve
  const { data: draw, error: drawErr } = await sb
    .from('lottery_draws')
    .insert({
      rules,
      pool_user_ids: poolUserIds,
      pool_weights: poolWeights,
      random_seed: '\\x' + seed.toString('hex'), // bytea hex literal
      winner_user_id: null,
    })
    .select('id')
    .single()
  if (drawErr) return { error: drawErr.message }

  // 5. 切 event_state；先清 qa_host 防止 mode_consistency 约束失败
  const { error: stateErr } = await sb
    .from('event_state')
    .update({
      screen_mode: 'lottery',
      qa_host_user_id: null,
      qa_section: null,
      lottery_draw_id: draw.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
  if (stateErr) return { error: stateErr.message }

  revalidatePath('/screen')
  return { error: null }
}

// 阶段 2：动画停帧 → 真正抽 winner。幂等：已 closed 直接返回当前 winner。
// 由大屏 LotterySlot 在 B 阶段尾巴调用一次。
export async function resolveLotteryAction(
  drawId: number,
): Promise<{ error: string | null; winnerId: string | null }> {
  // 注意：resolve 不要求 admin cookie —— 大屏可能没登录（admin cookie 只在
  // /screen 路由进入时由专用 token 写）。startLotteryAction 已经做了授权
  // gate，且一行 lottery_draws 只能 resolve 一次（幂等性靠 closed_at 判定）。
  const sb = getServerSupabase()

  const { data: draw, error: readErr } = await sb
    .from('lottery_draws')
    .select('id, pool_user_ids, pool_weights, winner_user_id, closed_at')
    .eq('id', drawId)
    .maybeSingle()
  if (readErr) return { error: readErr.message, winnerId: null }
  if (!draw) return { error: '抽奖记录不存在', winnerId: null }

  // 幂等：已落定，直接返回
  if (draw.closed_at && draw.winner_user_id) {
    return { error: null, winnerId: draw.winner_user_id as string }
  }

  const poolIds = (draw.pool_user_ids as string[]) ?? []
  const weights = (draw.pool_weights as Record<string, number>) ?? {}
  if (poolIds.length === 0) return { error: '池子为空', winnerId: null }

  // 加权抽取：累加权重 -> randomInt(0, total) -> 二分定位
  // 没权重数据时退化为均匀分布（每人 1）
  const cumulative: Array<{ uid: string; until: number }> = []
  let total = 0
  for (const uid of poolIds) {
    const w = Math.max(1, weights[uid] ?? 1)
    total += w
    cumulative.push({ uid, until: total })
  }
  const r = randomInt(0, total) // CSPRNG，[0, total)
  const winner = cumulative.find((c) => r < c.until)?.uid ?? poolIds[poolIds.length - 1]

  // 写 winner + closed_at（一致性约束保证两者同步）
  const { error: updErr } = await sb
    .from('lottery_draws')
    .update({
      winner_user_id: winner,
      closed_at: new Date().toISOString(),
    })
    .eq('id', drawId)
    .is('closed_at', null) // 防并发：如已 close 则不动
  if (updErr) return { error: updErr.message, winnerId: null }

  // Fire-and-forget：给中奖人发系统私信（中奖人没看大屏也能在手机收到）。
  // 失败只 log，抽奖本身不阻塞 —— 中奖结果已经写库 + 大屏已揭晓。
  void sendLotteryWinDm(winner, drawId).catch((e) => {
    console.error('lottery winner DM failed:', e)
  })

  // event_state 没动，不需要 revalidatePath（大屏自己拿到 winner）
  return { error: null, winnerId: winner }
}

// 给中奖人发系统私信。复用 DM 链路：
//   - dm_threads (system_user, winner) — 创建或复用
//   - dm_messages — 不进 publication，body 私密
//   - dm_notifications — 进 publication，drives winner 端 DmRealtime → router.refresh
//
// system user 由 migration 0022 通过 contact_handle='SYSTEM-LOTTERY' 标识；
// 这里查一次而不是缓存，避免冷启动 + multi-instance race。
async function sendLotteryWinDm(winnerUid: string, drawId: number): Promise<void> {
  const sb = getServerSupabase()

  const { data: sys } = await sb
    .from('users')
    .select('id')
    .eq('contact_handle', LOTTERY_NOTIFY_HANDLE)
    .maybeSingle()
  if (!sys?.id) {
    console.error(
      `lottery DM skipped: system user (${LOTTERY_NOTIFY_HANDLE}) not found — apply migration 0022`,
    )
    return
  }
  const systemUid = sys.id as string
  if (systemUid === winnerUid) return // 系统 user 自己中奖，跳过

  const pair = canonicalPair(systemUid, winnerUid)

  // 找已有 thread，没有就新建（unique(user_low,user_high) 撞了再查一次回退）
  let threadId: number
  const { data: existing } = await sb
    .from('dm_threads')
    .select('id')
    .eq('user_low', pair.user_low)
    .eq('user_high', pair.user_high)
    .maybeSingle()
  if (existing?.id) {
    threadId = existing.id as number
  } else {
    const { data: created, error: createErr } = await sb
      .from('dm_threads')
      .insert(pair)
      .select('id')
      .single()
    if (createErr || !created) {
      const { data: retry } = await sb
        .from('dm_threads')
        .select('id')
        .eq('user_low', pair.user_low)
        .eq('user_high', pair.user_high)
        .maybeSingle()
      if (!retry?.id) {
        console.error('lottery DM: thread create failed', createErr?.message)
        return
      }
      threadId = retry.id as number
    } else {
      threadId = created.id as number
    }
  }

  const body = `🎉 恭喜中奖！\n\n你在第 ${drawId} 轮抽奖中被抽中。请到主办方处领奖（凭这条私信即可）。`

  const { error: msgErr } = await sb.from('dm_messages').insert({
    thread_id: threadId,
    sender_id: systemUid,
    body,
    revealed_contact: null,
  })
  if (msgErr) {
    console.error('lottery DM: message insert failed', msgErr.message)
    return
  }

  const { error: notifErr } = await sb.from('dm_notifications').insert({
    recipient_id: winnerUid,
    thread_id: threadId,
  })
  if (notifErr) {
    // 消息已经入库，notif 失败只是 winner 端不会立刻 router.refresh —— 下次
    // 主动刷 /me 仍然能看到。不致命。
    console.error('lottery DM: notification insert failed', notifErr.message)
  }
}
