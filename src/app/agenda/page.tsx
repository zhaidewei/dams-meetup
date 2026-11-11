import { MeetupMemberLayout } from '@/components/meetup15/MeetupMemberNav'
import { MeetupPresence } from '@/components/meetup15/MeetupPresence'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'
import { meetupNow, meetupPhase } from '@/lib/meetup15/event'
import { MeetupAgenda, MeetupHeading, MeetupNav } from '@/components/meetup15/MeetupAgenda'

export const metadata = { title: '活动议程 · DAMS 第 15 期 Meetup' }
export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const now = meetupNow(meetupEnv())
  const member = await currentMember(now)
  if (meetupPhase(now) === 'closed') {
    return (
      <main className="mx-auto max-w-3xl space-y-8 px-5 py-8 sm:py-12">
        <MeetupNav closed />
        <MeetupHeading />
        <MeetupAgenda />
      </main>
    )
  }

  return (
    <MeetupMemberLayout active="/agenda">
      <div className="space-y-8 px-4 py-5 sm:px-6">
        {member && <MeetupPresence />}
        <MeetupHeading />
        <MeetupAgenda />
      </div>
    </MeetupMemberLayout>
  )
}
