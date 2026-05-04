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
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)

  if (error) return { error: error.message }
  revalidatePath('/screen')
  revalidatePath('/feed')
  return { error: null }
}
