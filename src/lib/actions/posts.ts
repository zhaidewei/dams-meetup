'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import { POST_MAX_CHARS, MATCH_INTENT_MAX_CHARS } from '@/lib/constants'

export type PostFormState = { error: string | null; ok?: boolean }

export async function createPostAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { error: '说点啥再发吧' }
  if (body.length > POST_MAX_CHARS) return { error: `不能超过 ${POST_MAX_CHARS} 字` }

  const nickname = nullableStr(formData.get('nickname'))
  const company = nullableStr(formData.get('company'))
  const contactHandle = nullableStr(formData.get('contact_handle'))
  const showContact = formData.get('show_contact') === 'on'
  const tags = parseTags(String(formData.get('tags') ?? ''))
  const matchIntentRaw = String(formData.get('match_intent') ?? '').trim()
  if (matchIntentRaw.length > MATCH_INTENT_MAX_CHARS) {
    return { error: `撮合需求不能超过 ${MATCH_INTENT_MAX_CHARS} 字` }
  }
  const matchIntent = matchIntentRaw.length > 0 ? matchIntentRaw : null

  const sb = getServerSupabase()

  // Persist identity updates so the next post auto-fills.
  const updates: Record<string, unknown> = { last_seen_at: new Date().toISOString() }
  if (nickname !== undefined) updates.nickname = nickname
  if (company !== undefined) updates.company = company
  if (contactHandle !== undefined) updates.contact_handle = contactHandle
  await sb.from('users').update(updates).eq('id', user.id)

  const { error } = await sb.from('posts').insert({
    user_id: user.id,
    type: 'text',
    body,
    tags,
    show_contact: showContact,
    match_intent: matchIntent,
  })

  if (error) return { error: error.message }

  revalidatePath('/feed')
  return { error: null, ok: true }
}

// Returns:
//  - undefined  : not present in form (don't update field)
//  - null       : explicitly cleared
//  - string     : new value
function nullableStr(v: FormDataEntryValue | null): string | null | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s.length === 0 ? null : s
}

function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,，；;]+/)
        .map((t) => t.replace(/^#/, '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 5)
}
