import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { DmThreadView } from '@/components/DmThreadView'
import { DmRealtime } from '@/components/DmRealtime'
import { fetchThread } from '@/lib/queries/dm'
import { fetchUnreadMe } from '@/lib/queries/unread'
import { isNonAnon } from '@/lib/dm'

export const dynamic = 'force-dynamic'

type Params = Promise<{ threadId: string }>

export default async function DmThreadPage({ params }: { params: Params }) {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const { threadId: raw } = await params
  const threadId = Number(raw)
  if (!Number.isInteger(threadId) || threadId <= 0) notFound()

  const detail = await fetchThread(threadId, user.id)
  if (!detail) notFound()

  // 进入线程时把对方发来的未读全部置为已读。idempotent — 全部已读时
  // 这次 update 命中 0 行。直接走 SQL 避开 server-action 的 redirect 逻辑。
  const sb = getServerSupabase()
  await sb
    .from('dm_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('sender_id', detail.other.id)
    .is('read_at', null)

  const unreadMe = await fetchUnreadMe(user)
  const viewerCanSend = isNonAnon(user)
  const viewerHasContact = (user.contact_handle ?? '').trim().length > 0

  return (
    <>
      <Header active="me" unreadMeCount={unreadMe.total} />
      <DmRealtime viewerId={user.id} />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="mb-3 text-sm">
          <Link href="/me" className="text-zinc-500 hover:text-zinc-800">
            ← 我的私信
          </Link>
        </div>
        <DmThreadView
          threadId={threadId}
          viewerId={user.id}
          viewerCanSend={viewerCanSend}
          viewerHasContact={viewerHasContact}
          other={detail.other}
          messages={detail.messages}
        />
      </main>
    </>
  )
}
