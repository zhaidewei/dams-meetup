'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import { REPLY_MAX_CHARS } from '@/lib/constants'

export type ReplyFormState = { error: string | null; ok?: boolean }

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
