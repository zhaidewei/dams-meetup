import 'server-only'
import { getServerSupabase } from '@/lib/supabase/server'
import type { DmMessageRow, PublicUserDisplay } from '@/lib/types'

export type DmThreadSummary = {
  thread_id: number
  other: PublicUserDisplay
  last_message: { body: string; created_at: string; sender_id: string } | null
  unread_count: number
}

export type DmThreadDetail = {
  thread_id: number
  other: PublicUserDisplay
  messages: DmMessageRow[]
}

const PUBLIC_USER_FIELDS =
  'id, nickname, company, contact_handle, show_contact, is_vip, vip_name, vip_title'

// 我参与的所有线程，按最后一条消息时间倒序。
export async function listMyThreads(viewerId: string): Promise<DmThreadSummary[]> {
  const sb = getServerSupabase()

  const { data: threads } = await sb
    .from('dm_threads')
    .select('id, user_low, user_high')
    .or(`user_low.eq.${viewerId},user_high.eq.${viewerId}`)

  if (!threads || threads.length === 0) return []

  const threadIds = threads.map((t) => t.id)
  const otherIds = threads.map((t) => (t.user_low === viewerId ? t.user_high : t.user_low))

  const [{ data: msgs }, { data: users }] = await Promise.all([
    sb
      .from('dm_messages')
      .select('id, thread_id, sender_id, body, read_at, created_at')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false }),
    sb
      .from('public_user_display')
      .select(PUBLIC_USER_FIELDS)
      .in('id', otherIds),
  ])

  const userById = new Map<string, PublicUserDisplay>()
  for (const u of (users ?? []) as PublicUserDisplay[]) userById.set(u.id, u)

  const lastByThread = new Map<number, { body: string; created_at: string; sender_id: string }>()
  const unreadByThread = new Map<number, number>()
  for (const m of (msgs ?? []) as Pick<
    DmMessageRow,
    'thread_id' | 'sender_id' | 'body' | 'read_at' | 'created_at'
  >[]) {
    if (!lastByThread.has(m.thread_id)) {
      lastByThread.set(m.thread_id, {
        body: m.body,
        created_at: m.created_at,
        sender_id: m.sender_id,
      })
    }
    if (m.sender_id !== viewerId && m.read_at === null) {
      unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1)
    }
  }

  const summaries: DmThreadSummary[] = threads.map((t) => {
    const otherId = t.user_low === viewerId ? t.user_high : t.user_low
    const other =
      userById.get(otherId) ??
      ({
        id: otherId,
        nickname: null,
        company: null,
        contact_handle: null,
        show_contact: false,
        is_vip: false,
        vip_name: null,
        vip_title: null,
      } satisfies PublicUserDisplay)
    return {
      thread_id: t.id,
      other,
      last_message: lastByThread.get(t.id) ?? null,
      unread_count: unreadByThread.get(t.id) ?? 0,
    }
  })

  // 按最后一条消息倒序；从未发过消息的线程沉底。
  summaries.sort((a, b) => {
    const ta = a.last_message?.created_at ?? ''
    const tb = b.last_message?.created_at ?? ''
    if (ta === tb) return 0
    return ta < tb ? 1 : -1
  })

  return summaries
}

export async function fetchThread(
  threadId: number,
  viewerId: string,
): Promise<DmThreadDetail | null> {
  const sb = getServerSupabase()
  const { data: thread } = await sb
    .from('dm_threads')
    .select('id, user_low, user_high')
    .eq('id', threadId)
    .maybeSingle()
  if (!thread) return null
  if (thread.user_low !== viewerId && thread.user_high !== viewerId) return null

  const otherId = thread.user_low === viewerId ? thread.user_high : thread.user_low

  const [{ data: messages }, { data: other }] = await Promise.all([
    sb
      .from('dm_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true }),
    sb
      .from('public_user_display')
      .select(PUBLIC_USER_FIELDS)
      .eq('id', otherId)
      .maybeSingle(),
  ])

  return {
    thread_id: threadId,
    other: (other ?? {
      id: otherId,
      nickname: null,
      company: null,
      contact_handle: null,
      show_contact: false,
      is_vip: false,
      vip_name: null,
      vip_title: null,
    }) as PublicUserDisplay,
    messages: (messages ?? []) as DmMessageRow[],
  }
}

export async function fetchUnreadDmCount(viewerId: string): Promise<number> {
  const sb = getServerSupabase()
  // 找出我参与的 threadIds，再 count 对方发来未读。
  const { data: threads } = await sb
    .from('dm_threads')
    .select('id, user_low, user_high')
    .or(`user_low.eq.${viewerId},user_high.eq.${viewerId}`)
  if (!threads || threads.length === 0) return 0

  const threadIds = threads.map((t) => t.id)
  const { count } = await sb
    .from('dm_messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', threadIds)
    .neq('sender_id', viewerId)
    .is('read_at', null)

  return count ?? 0
}
