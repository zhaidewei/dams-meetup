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
