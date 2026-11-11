import { MeetupMemberNav } from '@/components/meetup15/MeetupMemberNav'
import { MeetupPresence } from '@/components/meetup15/MeetupPresence'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'
import { meetupNow, meetupPhase } from '@/lib/meetup15/event'
import { MeetupAgenda, MeetupHeading, MeetupNav } from '@/components/meetup15/MeetupAgenda'

export const metadata = { title: '活动议程 · DAMS 第 15 期 Meetup' }
export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const now = meetupNow(meetupEnv())
  const member = await currentMember(now)
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 pt-8 pb-24 md:pb-8 sm:py-12">
      {member && <MeetupPresence />}
      <MeetupNav closed={meetupPhase(now) === 'closed'} />
      <MeetupHeading />
      <MeetupAgenda />
      {member && <MeetupMemberNav active="/agenda" mobile />}
    </main>
  )
}
