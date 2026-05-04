'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import { canonicalPair, isNonAnon } from '@/lib/dm'
import { DM_MAX_CHARS } from '@/lib/constants'
import type { DmThreadRow } from '@/lib/types'

export type DmMutationResult = { error: string | null }
export type StartThreadResult = { error: string | null; threadId?: number }

export async function startThreadAction(toUserId: string): Promise<StartThreadResult> {
  const viewer = await getCurrentUser()
  if (!viewer) redirect('/')
  if (!isNonAnon(viewer)) {
    return { error: '请先到「我」页面设置昵称才能私信别人' }
  }
  if (typeof toUserId !== 'string' || toUserId.length < 32) {
    return { error: '对方 id 不对' }
  }
  if (toUserId === viewer.id) {
    return { error: '不能给自己发私信' }
  }

  const pair = canonicalPair(viewer.id, toUserId)
  const sb = getServerSupabase()

  const { data: existing, error: lookupErr } = await sb
    .from('dm_threads')
    .select('id')
    .eq('user_low', pair.user_low)
    .eq('user_high', pair.user_high)
    .maybeSingle()

  if (lookupErr) return { error: lookupErr.message }
  if (existing) return { error: null, threadId: existing.id }

  const { data: created, error: insertErr } = await sb
    .from('dm_threads')
    .insert(pair)
    .select('id')
    .single()

  if (insertErr || !created) {
    // 并发兼容：另一边可能刚 insert 了，撞 unique → 再查一次。
    const { data: retry } = await sb
      .from('dm_threads')
      .select('id')
      .eq('user_low', pair.user_low)
      .eq('user_high', pair.user_high)
      .maybeSingle()
    if (retry) return { error: null, threadId: retry.id }
    return { error: insertErr?.message ?? '创建线程失败' }
  }

  return { error: null, threadId: created.id }
}

export async function sendDmAction(
  threadId: number,
  body: string,
): Promise<DmMutationResult> {
  const viewer = await getCurrentUser()
  if (!viewer) redirect('/')
  if (!isNonAnon(viewer)) {
    return { error: '请先设置昵称才能发送私信' }
  }
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return { error: '线程 id 不对' }
  }
  const trimmed = String(body ?? '').trim()
  if (!trimmed) return { error: '说点啥再发吧' }
  if (trimmed.length > DM_MAX_CHARS) return { error: `不能超过 ${DM_MAX_CHARS} 字` }

  const sb = getServerSupabase()
  const other = await fetchThreadOtherParty(sb, threadId, viewer.id)
  if (!other) return { error: '不是这个线程的成员' }

  // 联系方式由对方点头像看 UserCard 自取，不再随消息一次性 reveal。
  // 历史 revealed_contact 列保留旧消息的展示，本次插入恒为 null。
  const { error: msgErr } = await sb.from('dm_messages').insert({
    thread_id: threadId,
    sender_id: viewer.id,
    body: trimmed,
    revealed_contact: null,
  })
  if (msgErr) return { error: msgErr.message }

  // 通知 fan-out：单独表，进 publication，drives 接收方 Realtime。
  // 失败不致命（消息已经入库），日志即可。
  const { error: notifErr } = await sb.from('dm_notifications').insert({
    recipient_id: other,
    thread_id: threadId,
  })
  if (notifErr) {
    console.error('dm_notifications insert failed:', notifErr.message)
  }

  revalidatePath(`/me/dm/${threadId}`)
  revalidatePath('/me')
  return { error: null }
}

export async function markDmReadAction(threadId: number): Promise<DmMutationResult> {
  const viewer = await getCurrentUser()
  if (!viewer) redirect('/')
  if (!Number.isInteger(threadId) || threadId <= 0) return { error: '线程 id 不对' }

  const sb = getServerSupabase()
  const other = await fetchThreadOtherParty(sb, threadId, viewer.id)
  if (!other) return { error: '不是这个线程的成员' }

  const { error } = await sb
    .from('dm_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('sender_id', other)
    .is('read_at', null)

  if (error) return { error: error.message }

  revalidatePath(`/me/dm/${threadId}`)
  revalidatePath('/me')
  return { error: null }
}

// 查 thread 双方，返回"对方"的 user id。viewer 不是成员则返回 null。
type ServerSupabase = ReturnType<typeof getServerSupabase>
async function fetchThreadOtherParty(
  sb: ServerSupabase,
  threadId: number,
  viewerId: string,
): Promise<string | null> {
  const { data } = await sb
    .from('dm_threads')
    .select('user_low, user_high')
    .eq('id', threadId)
    .maybeSingle()
  if (!data) return null
  const t = data as Pick<DmThreadRow, 'user_low' | 'user_high'>
  if (t.user_low === viewerId) return t.user_high
  if (t.user_high === viewerId) return t.user_low
  return null
}
