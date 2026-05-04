import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import { isSectionId, sectionByClock, type SectionId } from '@/lib/sections'
import type { ScreenMode } from '@/lib/types'

// 主办方覆写优先；过期或未设置则回落到议程时间表 (sectionByClock)。
// 不命中（空档期 / 活动开始前 / 结束后）返回 null。
export async function getCurrentSection(): Promise<SectionId | null> {
  const sb = getServerSupabase()
  const { data } = await sb
    .from('event_state')
    .select('current_section, override_until')
    .eq('id', 1)
    .maybeSingle()

  if (data?.current_section && data.override_until) {
    const validUntil = Date.parse(data.override_until as string)
    if (Number.isFinite(validUntil) && Date.now() < validUntil) {
      const s = data.current_section as string
      if (isSectionId(s)) return s
    }
  }

  return sectionByClock()
}

export type ScreenModeState = {
  mode: ScreenMode
  qa_host_user_id: string | null
  qa_host_name: string | null
  qa_host_title: string | null
}

// 读 screen_mode + 可能伴随的 host 信息。一次查询即够 — /screen 顶层 fetch。
export async function getScreenModeState(): Promise<ScreenModeState> {
  const sb = getServerSupabase()
  const { data } = await sb
    .from('event_state')
    .select(
      'screen_mode, qa_host_user_id, host:users!qa_host_user_id ( vip_name, nickname, vip_title, company )',
    )
    .eq('id', 1)
    .maybeSingle()

  if (!data) {
    return { mode: 'default', qa_host_user_id: null, qa_host_name: null, qa_host_title: null }
  }

  type HostRow = {
    vip_name: string | null
    nickname: string | null
    vip_title: string | null
    company: string | null
  }
  const hostRel = (data as { host?: HostRow | HostRow[] | null }).host
  const host = Array.isArray(hostRel) ? hostRel[0] ?? null : hostRel ?? null

  const mode = (data.screen_mode as ScreenMode) ?? 'default'
  return {
    mode,
    qa_host_user_id: (data.qa_host_user_id as string | null) ?? null,
    qa_host_name: host ? host.vip_name ?? host.nickname ?? null : null,
    qa_host_title: host ? host.vip_title ?? host.company ?? null : null,
  }
}

export type VipForDropdown = {
  user_id: string
  name: string
  title: string | null
}

// 给 admin 控制台 QA host dropdown 用：列出已绑定的 VIP（vip_tokens.user_id 非空）。
export async function listVipUsers(): Promise<VipForDropdown[]> {
  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('vip_tokens')
    .select('user_id, vip_name, vip_title')
    .not('user_id', 'is', null)
    .order('vip_name')

  if (error || !data) return []
  return data
    .filter((r): r is { user_id: string; vip_name: string; vip_title: string | null } =>
      typeof r.user_id === 'string',
    )
    .map((r) => ({ user_id: r.user_id, name: r.vip_name, title: r.vip_title }))
}
