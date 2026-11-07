import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import { isSectionId, sectionByClock, type SectionId } from '@/lib/sections'

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
