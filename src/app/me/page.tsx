import { MeetupMemberLayout } from '@/components/meetup15/MeetupMemberNav'
import { redirect } from 'next/navigation'
import { MeetupPresence } from '@/components/meetup15/MeetupPresence'
import { PersonalPanel } from '@/components/meetup15/PersonalPanel'
import { currentMember } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '我 · DAMS 第 15 期 Meetup' }

export default async function MePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const member = await currentMember()
  if (!member) redirect('/')
  const messages = (await searchParams).view === 'messages'

  return (
    <MeetupMemberLayout active="/me">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6">
        <MeetupPresence />
        <header className="rounded-2xl bg-sky-50 p-5"><h1 className="text-2xl font-bold">我的</h1></header>
        <PersonalPanel key={String(messages)} initialMessages={messages} />
      </div>
    </MeetupMemberLayout>
  )
}
