'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser, readAdminCookie } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import { POST_MAX_CHARS, MATCH_INTENT_MAX_CHARS } from '@/lib/constants'
import { DEFAULT_SECTION, isSectionId } from '@/lib/sections'
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
  const aiConsentTicked = formData.get('ai_consent') === 'on'

  // Consent gate (issue #34): match_intent only persists if the user has
  // already consented OR is consenting on this submit via the ai_consent
  // checkbox. No silent drops — surface a clear error so user can retry.
  if (matchIntent && !user.ai_consent_at && !aiConsentTicked) {
    return { error: '需要先勾选「同意把内容发给 DeepSeek 处理」才能委托 AI 撮合' }
  }

  const sectionRaw = formData.get('section')
  const section = isSectionId(sectionRaw) ? sectionRaw : null

  const sb = getServerSupabase()

  // Persist identity updates so the next post auto-fills.
  const updates: Record<string, unknown> = { last_seen_at: new Date().toISOString() }
  if (nickname !== undefined) updates.nickname = nickname
  if (company !== undefined) updates.company = company
  if (contactHandle !== undefined) updates.contact_handle = contactHandle
  // Grant consent inline only when actually using AI matching (matchIntent
  // present). Ticking the checkbox without sending intent is a no-op — keeps
  // the example behavior: 拒绝过的话再次发消息会再次询问.
  if (matchIntent && aiConsentTicked && !user.ai_consent_at) {
    updates.ai_consent_at = new Date().toISOString()
  }
  await sb.from('users').update(updates).eq('id', user.id)

  const { data: inserted, error } = await sb
    .from('posts')
    .insert({
      user_id: user.id,
      type: 'text',
      body,
      tags,
      show_contact: showContact,
      section,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  // match_intent lives in a separate table (migration 0011) so it can't leak
  // via Realtime broadcast. Best-effort write — if it fails we still keep the
  // post; AI matching can run without intent for that post.
  if (matchIntent) {
    const { error: intentErr } = await sb
      .from('post_match_intents')
      .insert({ post_id: inserted.id, intent: matchIntent })
    if (intentErr) {
      console.error('post_match_intents insert failed:', intentErr.message)
    }
  }

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

// 观众端 QA 提问 — 比 createPostAction 简洁很多：没有 tags / section / match_intent。
// hostUserId 必须当下确实是 event_state.qa_host_user_id；防止活动结束后还能注水。
export async function createQuestionAction(
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { error: '说点啥再发吧' }
  if (body.length > POST_MAX_CHARS) return { error: `不能超过 ${POST_MAX_CHARS} 字` }

  const sb = getServerSupabase()

  const { data: state, error: stateErr } = await sb
    .from('event_state')
    .select('screen_mode, qa_host_user_id, qa_section')
    .eq('id', 1)
    .maybeSingle()
  if (stateErr) return { error: stateErr.message }
  if (!state || state.screen_mode !== 'qa' || !state.qa_host_user_id) {
    return { error: 'QA 已经结束了' }
  }
  // qa_section 是 startQa 时快照的板块；活动外启动会落到 DEFAULT_SECTION (lounge)，
  // 兜底脏数据也归到 lounge，保证 question 帖永远有归属。
  const questionSection = isSectionId(state.qa_section) ? state.qa_section : DEFAULT_SECTION

  // Identity updates: nickname / company optional; questions are usually
  // posted with whatever identity the user has. Match createPostAction's
  // pattern so users can edit-and-submit in one go.
  const nickname = nullableStr(formData.get('nickname'))
  const company = nullableStr(formData.get('company'))
  const contactHandle = nullableStr(formData.get('contact_handle'))
  const updates: Record<string, unknown> = { last_seen_at: new Date().toISOString() }
  if (nickname !== undefined) updates.nickname = nickname
  if (company !== undefined) updates.company = company
  if (contactHandle !== undefined) updates.contact_handle = contactHandle
  await sb.from('users').update(updates).eq('id', user.id)

  const { error } = await sb.from('posts').insert({
    user_id: user.id,
    type: 'question',
    body,
    tags: [],
    show_contact: false,
    section: questionSection,
    question_target_user_id: state.qa_host_user_id,
  })
  if (error) return { error: error.message }

  revalidatePath('/feed')
  revalidatePath('/screen')
  return { error: null, ok: true }
}

// =====================================================================
// QA: 标记问题已答 (issue #29) — admin 专属
// =====================================================================
export async function setQuestionAnsweredAction(
  postId: number,
  answered: boolean,
): Promise<PostMutationResult> {
  if (!(await readAdminCookie())) return { error: '未授权' }
  if (!Number.isInteger(postId) || postId <= 0) return { error: '帖子 id 不对' }

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('posts')
    .update({ answered_at: answered ? new Date().toISOString() : null })
    .eq('id', postId)
    .eq('type', 'question')
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: '没找到这条提问' }

  revalidatePath('/feed')
  revalidatePath('/screen')
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
