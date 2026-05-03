'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import { REPLY_MAX_CHARS } from '@/lib/constants'

export type ReplyFormState = { error: string | null; ok?: boolean }
export type ReplyMutationResult = { error: string | null }

export async function createReplyAction(
  _prev: ReplyFormState,
  formData: FormData,
): Promise<ReplyFormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const postId = Number(formData.get('post_id'))
  const body = String(formData.get('body') ?? '').trim()
  if (!Number.isInteger(postId) || postId <= 0) return { error: '帖子 id 不对' }
  if (!body) return { error: '回复不能为空' }
  if (body.length > REPLY_MAX_CHARS) return { error: `不能超过 ${REPLY_MAX_CHARS} 字` }

  const sb = getServerSupabase()
  const { error } = await sb
    .from('replies')
    .insert({ user_id: user.id, post_id: postId, body })

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
