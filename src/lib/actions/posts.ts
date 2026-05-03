'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import { POST_MAX_CHARS, MATCH_INTENT_MAX_CHARS } from '@/lib/constants'
import { isSectionId } from '@/lib/sections'
import { parseTags } from '@/lib/tags'

export type PostFormState = { error: string | null; ok?: boolean }
export type PostMutationResult = { error: string | null }

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

  const sectionRaw = formData.get('section')
  const section = isSectionId(sectionRaw) ? sectionRaw : null

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
    section,
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

// Authorize-by-filter: .eq('user_id', user.id) means a non-owner update
// hits 0 rows. Polls can be deleted but not edited (vote integrity).
export async function updatePostAction(
  postId: number,
  body: string,
  tagsRaw: string,
): Promise<PostMutationResult> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  if (!Number.isInteger(postId) || postId <= 0) return { error: '帖子 id 不对' }
  const trimmed = String(body ?? '').trim()
  if (!trimmed) return { error: '内容不能为空' }
  if (trimmed.length > POST_MAX_CHARS) return { error: `不能超过 ${POST_MAX_CHARS} 字` }

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('posts')
    .update({ body: trimmed, tags: parseTags(String(tagsRaw ?? '')) })
    .eq('id', postId)
    .eq('user_id', user.id)
    .eq('type', 'text')
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: '没找到这条帖子，或者它不是你的（投票贴不可编辑）' }

  revalidatePath('/feed')
  revalidatePath('/me')
  return { error: null }
}

export async function deletePostAction(postId: number): Promise<PostMutationResult> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  if (!Number.isInteger(postId) || postId <= 0) return { error: '帖子 id 不对' }

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: '没找到这条帖子，或者它不是你的' }

  revalidatePath('/feed')
  revalidatePath('/me')
  return { error: null }
}
