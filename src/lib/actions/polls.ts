'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import {
  EVENT_END_ISO,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POST_MAX_CHARS,
} from '@/lib/constants'
import type { PollOption } from '@/lib/types'
import { isSectionId } from '@/lib/sections'

export type PollFormState = { error: string | null; ok?: boolean }

export async function createPollAction(
  _prev: PollFormState,
  formData: FormData,
): Promise<PollFormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/')
  if (!user.is_vip) return { error: '只有嘉宾可以发起投票' }

  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { error: '请填写投票题目' }
  if (body.length > POST_MAX_CHARS) return { error: `题目不能超过 ${POST_MAX_CHARS} 字` }

  const optionLabels = formData
    .getAll('option')
    .map((o) => String(o).trim())
    .filter(Boolean)

  if (optionLabels.length < POLL_MIN_OPTIONS) {
    return { error: `至少 ${POLL_MIN_OPTIONS} 个选项` }
  }
  if (optionLabels.length > POLL_MAX_OPTIONS) {
    return { error: `最多 ${POLL_MAX_OPTIONS} 个选项` }
  }

  const options: PollOption[] = optionLabels.map((label, i) => ({
    id: i + 1,
    label,
  }))

  const multi = formData.get('multi') === 'on'
  const hideResults = formData.get('hide_results') === 'on'

  const sectionRaw = formData.get('section')
  const section = isSectionId(sectionRaw) ? sectionRaw : null

  const sb = getServerSupabase()
  const { error } = await sb.from('posts').insert({
    user_id: user.id,
    type: 'poll',
    body,
    tags: [],
    show_contact: false,
    section,
    poll_options: options,
    poll_multi: multi,
    poll_deadline: EVENT_END_ISO,
    poll_hide_results: hideResults,
  })

  if (error) return { error: error.message }

  revalidatePath('/feed')
  revalidatePath('/me')
  return { error: null, ok: true }
}

export type VoteFormState = { error: string | null; ok?: boolean }

export async function voteAction(
  _prev: VoteFormState,
  formData: FormData,
): Promise<VoteFormState> {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const postId = Number(formData.get('post_id'))
  if (!Number.isFinite(postId)) return { error: '无效的投票' }

  const optionIds = formData
    .getAll('option_id')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))

  if (optionIds.length === 0) return { error: '请至少选一个选项' }

  const sb = getServerSupabase()

  const { data: post } = await sb
    .from('posts')
    .select('id, type, poll_options, poll_multi, poll_deadline')
    .eq('id', postId)
    .maybeSingle()

  if (!post || post.type !== 'poll') return { error: '该帖子不是投票' }

  // Deadline check: poll closes at activity end.
  const deadline = post.poll_deadline ? new Date(post.poll_deadline) : null
  if (deadline && Date.now() >= deadline.getTime()) {
    return { error: '投票已截止' }
  }

  // Validate option_ids against the poll's options.
  const validIds = new Set(
    ((post.poll_options ?? []) as PollOption[]).map((o) => o.id),
  )
  for (const oid of optionIds) {
    if (!validIds.has(oid)) return { error: '选项无效' }
  }

  if (!post.poll_multi && optionIds.length > 1) {
    return { error: '该投票为单选' }
  }

  // Replace any prior votes by this user on this post.
  const { error: delErr } = await sb
    .from('poll_votes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id)
  if (delErr) return { error: delErr.message }

  const rows = optionIds.map((oid) => ({
    user_id: user.id,
    post_id: postId,
    option_id: oid,
  }))
  const { error: insErr } = await sb.from('poll_votes').insert(rows)
  if (insErr) return { error: insErr.message }

  revalidatePath('/feed')
  revalidatePath('/me')
  return { error: null, ok: true }
}
