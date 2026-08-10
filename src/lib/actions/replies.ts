'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import { REPLY_MAX_CHARS } from '@/lib/constants'
import { requireNonAnon } from '@/lib/permissions'

export type ReplyFormState = { error: string | null; ok?: boolean }
export type ReplyMutationResult = { error: string | null }

export async function createReplyAction(
  _prev: ReplyFormState,
  formData: FormData,
): Promise<ReplyFormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const gate = requireNonAnon(user)
  if (!gate.ok) return { error: gate.error }

  const postId = Number(formData.get('post_id'))
  const body = String(formData.get('body') ?? '').trim()
  if (!Number.isInteger(postId) || postId <= 0) return { error: '帖子 id 不对' }
  if (!body) return { error: '回复不能为空' }
  if (body.length > REPLY_MAX_CHARS) return { error: `不能超过 ${REPLY_MAX_CHARS} 字` }

  const parentRaw = formData.get('parent_reply_id')
  let parentReplyId: number | null = null
  if (parentRaw !== null && parentRaw !== '') {
    const n = Number(parentRaw)
    if (!Number.isInteger(n) || n <= 0) return { error: '回复 parent id 不对' }
    parentReplyId = n
  }

  const sb = getServerSupabase()

  // One-level nesting: if the parent itself has a parent, flatten to the
  // grandparent (= the top-level reply of this thread). This means children
  // never gain children — same thread, same depth.
  if (parentReplyId !== null) {
    const { data: parent, error: pErr } = await sb
      .from('replies')
      .select('id, post_id, parent_reply_id')
      .eq('id', parentReplyId)
      .maybeSingle()
    if (pErr) return { error: pErr.message }
    if (!parent) return { error: '父回复不存在' }
    if (parent.post_id !== postId) return { error: '父回复不属于这个帖子' }
    parentReplyId = parent.parent_reply_id ?? parent.id
  }

  const { error } = await sb
    .from('replies')
    .insert({ user_id: user.id, post_id: postId, body, parent_reply_id: parentReplyId })

  if (error) return { error: error.message }

  revalidatePath('/feed')
  return { error: null, ok: true }
}

// Authorize-by-filter: .eq('user_id', user.id) means a non-owner update
// affects 0 rows (data === null). AI replies (user_id IS NULL) are
// implicitly excluded — they never match a real uid.
export async function updateReplyAction(
  replyId: number,
  body: string,
): Promise<ReplyMutationResult> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  if (!Number.isInteger(replyId) || replyId <= 0) return { error: '回复 id 不对' }
  const trimmed = String(body ?? '').trim()
  if (!trimmed) return { error: '回复不能为空' }
  if (trimmed.length > REPLY_MAX_CHARS) return { error: `不能超过 ${REPLY_MAX_CHARS} 字` }

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('replies')
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq('id', replyId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: '没找到这条回复，或者它不是你的' }

  revalidatePath('/feed')
  revalidatePath('/me')
  return { error: null }
}

export async function deleteReplyAction(
  replyId: number,
): Promise<ReplyMutationResult> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  if (!Number.isInteger(replyId) || replyId <= 0) return { error: '回复 id 不对' }

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('replies')
    .delete()
    .eq('id', replyId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: '没找到这条回复，或者它不是你的' }

  revalidatePath('/feed')
  revalidatePath('/me')
  return { error: null }
}

// =============================================================================
// reply_reactions: emoji reactions on replies
// =============================================================================
export async function toggleReplyReactionAction(
  replyId: number,
  emoji: string,
): Promise<ReplyMutationResult> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  if (!Number.isInteger(replyId) || replyId <= 0) return { error: '回复 id 不对' }
  if (!emoji || emoji.length > 4) return { error: 'emoji 不对' }

  const sb = getServerSupabase()

  // Check if reaction already exists
  const { data: existing } = await sb
    .from('reply_reactions')
    .select('emoji')
    .eq('reply_id', replyId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    // Remove reaction
    const { error } = await sb
      .from('reply_reactions')
      .delete()
      .eq('reply_id', replyId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)

    if (error) return { error: error.message }
  } else {
    // Add reaction
    const { error } = await sb
      .from('reply_reactions')
      .insert({ reply_id: replyId, user_id: user.id, emoji })

    if (error) return { error: error.message }
  }

  revalidatePath('/feed')
  return { error: null }
}
