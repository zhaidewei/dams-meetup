import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { Header } from '@/components/Header'
import { Agenda } from '@/components/Agenda'

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  return (
    <>
      <Header active="agenda" />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <Agenda />
      </main>
    </>
  )
}
