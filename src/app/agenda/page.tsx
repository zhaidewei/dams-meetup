import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { Header } from '@/components/Header'
import { DmRealtime } from '@/components/DmRealtime'
import { Agenda } from '@/components/Agenda'
import { fetchUnreadMe } from '@/lib/queries/unread'

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const unreadMe = await fetchUnreadMe(user)

  return (
    <>
      <Header active="agenda" unreadMeCount={unreadMe.total} />
      <DmRealtime viewerId={user.id} />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <Agenda />
      </main>
    </>
  )
}
