'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'

export type ProfileFormState = { error: string | null; ok?: boolean }

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const nickname = nullableStr(formData.get('nickname'))
  const company = nullableStr(formData.get('company'))
  const contactHandle = nullableStr(formData.get('contact_handle'))
  const showContact = formData.get('show_contact') === 'on'

  const sb = getServerSupabase()

  // VIPs can't change vip_name/vip_title via this form, but can still set
  // nickname/company/contact_handle for non-VIP posts (we don't currently
  // expose that distinction; left as-is).
  const updates: Record<string, unknown> = {
    show_contact: showContact,
    last_seen_at: new Date().toISOString(),
  }
  if (nickname !== undefined) updates.nickname = nickname
  if (company !== undefined) updates.company = company
  if (contactHandle !== undefined) updates.contact_handle = contactHandle

  const { error } = await sb.from('users').update(updates).eq('id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/me')
  revalidatePath('/feed')
  return { error: null, ok: true }
}

function nullableStr(v: FormDataEntryValue | null): string | null | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s.length === 0 ? null : s
}
