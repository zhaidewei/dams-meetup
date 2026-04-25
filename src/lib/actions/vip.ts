'use server'

import { redirect } from 'next/navigation'
import { ensureUser, setPwCookie, setUidCookie } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'

// Validates VIP username+password against vip_tokens.
// Strict invariant: 1 VIP token row ↔ 1 users row, shared across devices.
// First login binds vip_tokens.user_id to the browser's existing/new users row.
// Subsequent logins from any device adopt that same users row via uid cookie.
export async function vipLoginAction(formData: FormData) {
  const username = String(formData.get('username') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()

  if (!username || !password) {
    redirect('/vip-login?error=missing')
  }

  const sb = getServerSupabase()

  const { data: vip } = await sb
    .from('vip_tokens')
    .select('token, username, password, vip_name, vip_title, user_id')
    .eq('username', username)
    .eq('password', password)
    .maybeSingle()

  if (!vip) {
    redirect('/vip-login?error=bad')
  }

  await setPwCookie()

  let userId: string

  if (vip.user_id) {
    // Already bound on a previous device → reuse same users row.
    userId = vip.user_id
    await setUidCookie(userId)
  } else {
    // First-ever login for this VIP → bind to the current browser's user row
    // (or freshly created one if this is also a fresh browser).
    const user = await ensureUser()
    userId = user.id
    await sb
      .from('vip_tokens')
      .update({ user_id: userId, used_at: new Date().toISOString() })
      .eq('token', vip.token)
  }

  // Apply VIP attributes (idempotent on re-login).
  await sb
    .from('users')
    .update({
      is_vip: true,
      vip_name: vip.vip_name,
      vip_title: vip.vip_title,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', userId)

  redirect('/feed')
}
