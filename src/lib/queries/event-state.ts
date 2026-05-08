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
  // 本轮 QA 绑定的板块（startQa 时快照 LIVE section）；null = 不绑定。
  qa_section: SectionId | null
  // 上一轮 QA 的 host（exit 时归档），给 /feed 塌陷区块用；
  // 当 mode='qa' 时这俩字段不应该被用（用 qa_host_* 即可）。
  last_qa_host_user_id: string | null
  last_qa_host_name: string | null
  last_qa_section: SectionId | null
  lottery_draw_id: number | null
  // 大屏视图筛选（issue #45 升级为 server state）；null = 显示全部。
  // 跟 LIVE 板块解耦：current_section 是"事实当前在演讲谁"，filter 是
  // 主办方"想让大屏放大看哪一段"。手机 /admin 改这个，所有 /screen tab 同步。
  screen_filter_section: SectionId | null
}

// 读 screen_mode + 可能伴随的 host 信息。一次查询即够 — /screen 顶层 fetch。
export async function getScreenModeState(): Promise<ScreenModeState> {
  const sb = getServerSupabase()
  const { data } = await sb
    .from('event_state')
    .select(
      `screen_mode, qa_host_user_id, qa_section, screen_filter_section,
       last_qa_host_user_id, last_qa_section, lottery_draw_id,
       host:users!qa_host_user_id ( vip_name, nickname, vip_title, company ),
       last_host:users!last_qa_host_user_id ( vip_name, nickname )`,
    )
    .eq('id', 1)
    .maybeSingle()

  if (!data) {
    return {
      mode: 'default',
      qa_host_user_id: null,
      qa_host_name: null,
      qa_host_title: null,
      qa_section: null,
      last_qa_host_user_id: null,
      last_qa_host_name: null,
      last_qa_section: null,
      lottery_draw_id: null,
      screen_filter_section: null,
    }
  }

  type HostRow = {
    vip_name: string | null
    nickname: string | null
    vip_title: string | null
    company: string | null
  }
  type LastHostRow = { vip_name: string | null; nickname: string | null }
  const hostRel = (data as { host?: HostRow | HostRow[] | null }).host
  const host = Array.isArray(hostRel) ? hostRel[0] ?? null : hostRel ?? null
  const lastHostRel = (data as { last_host?: LastHostRow | LastHostRow[] | null }).last_host
  const lastHost = Array.isArray(lastHostRel) ? lastHostRel[0] ?? null : lastHostRel ?? null

  const mode = (data.screen_mode as ScreenMode) ?? 'default'
  const qaSectionRaw = data.qa_section as string | null
  const lastQaSectionRaw = data.last_qa_section as string | null
  const filterSectionRaw = data.screen_filter_section as string | null
  return {
    mode,
    qa_host_user_id: (data.qa_host_user_id as string | null) ?? null,
    qa_host_name: host ? host.vip_name ?? host.nickname ?? null : null,
    qa_host_title: host ? host.vip_title ?? host.company ?? null : null,
    qa_section: isSectionId(qaSectionRaw) ? qaSectionRaw : null,
    last_qa_host_user_id: (data.last_qa_host_user_id as string | null) ?? null,
    last_qa_host_name: lastHost ? lastHost.vip_name ?? lastHost.nickname ?? null : null,
    last_qa_section: isSectionId(lastQaSectionRaw) ? lastQaSectionRaw : null,
    lottery_draw_id: (data.lottery_draw_id as number | null) ?? null,
    screen_filter_section: isSectionId(filterSectionRaw) ? filterSectionRaw : null,
  }
}

// /feed 和 /screen 渲染都需要 (current_section + override_until) 和 (screen_mode + qa host
// 信息)。两路本来各跑一次 `from('event_state').eq('id',1)`，加上 host nested join。
// 200 并发用户下 PostgREST 池被这种重复查询挤爆（5/9 实测 503 风暴）。
// 这里合成一次 round-trip — `event_state` 只有一行，多读几个列零成本。
export type EventStateBundle = {
  liveSection: SectionId | null
  modeState: ScreenModeState
}
export async function getEventStateBundle(): Promise<EventStateBundle> {
  const sb = getServerSupabase()
  const { data } = await sb
    .from('event_state')
    .select(
      `current_section, override_until,
       screen_mode, qa_host_user_id, qa_section, screen_filter_section,
       last_qa_host_user_id, last_qa_section, lottery_draw_id,
       host:users!qa_host_user_id ( vip_name, nickname, vip_title, company ),
       last_host:users!last_qa_host_user_id ( vip_name, nickname )`,
    )
    .eq('id', 1)
    .maybeSingle()

  let liveSection: SectionId | null = null
  if (data?.current_section && data.override_until) {
    const validUntil = Date.parse(data.override_until as string)
    if (Number.isFinite(validUntil) && Date.now() < validUntil) {
      const s = data.current_section as string
      if (isSectionId(s)) liveSection = s
    }
  }
  if (liveSection === null) liveSection = sectionByClock()

  if (!data) {
    return {
      liveSection,
      modeState: {
        mode: 'default',
        qa_host_user_id: null,
        qa_host_name: null,
        qa_host_title: null,
        qa_section: null,
        last_qa_host_user_id: null,
        last_qa_host_name: null,
        last_qa_section: null,
        lottery_draw_id: null,
        screen_filter_section: null,
      },
    }
  }

  type HostRow = {
    vip_name: string | null
    nickname: string | null
    vip_title: string | null
    company: string | null
  }
  type LastHostRow = { vip_name: string | null; nickname: string | null }
  const hostRel = (data as { host?: HostRow | HostRow[] | null }).host
  const host = Array.isArray(hostRel) ? hostRel[0] ?? null : hostRel ?? null
  const lastHostRel = (data as { last_host?: LastHostRow | LastHostRow[] | null }).last_host
  const lastHost = Array.isArray(lastHostRel) ? lastHostRel[0] ?? null : lastHostRel ?? null

  const mode = (data.screen_mode as ScreenMode) ?? 'default'
  const qaSectionRaw = data.qa_section as string | null
  const lastQaSectionRaw = data.last_qa_section as string | null
  const filterSectionRaw = data.screen_filter_section as string | null

  return {
    liveSection,
    modeState: {
      mode,
      qa_host_user_id: (data.qa_host_user_id as string | null) ?? null,
      qa_host_name: host ? host.vip_name ?? host.nickname ?? null : null,
      qa_host_title: host ? host.vip_title ?? host.company ?? null : null,
      qa_section: isSectionId(qaSectionRaw) ? qaSectionRaw : null,
      last_qa_host_user_id: (data.last_qa_host_user_id as string | null) ?? null,
      last_qa_host_name: lastHost ? lastHost.vip_name ?? lastHost.nickname ?? null : null,
      last_qa_section: isSectionId(lastQaSectionRaw) ? lastQaSectionRaw : null,
      lottery_draw_id: (data.lottery_draw_id as number | null) ?? null,
      screen_filter_section: isSectionId(filterSectionRaw) ? filterSectionRaw : null,
    },
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
