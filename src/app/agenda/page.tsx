import { MeetupAgenda, MeetupHeading, MeetupNav } from '@/components/meetup15/MeetupAgenda'

export const metadata = { title: '活动议程 · DAMS 第 15 期 Meetup' }

export default function AgendaPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-8 sm:py-12">
      <MeetupNav />
      <MeetupHeading />
      <MeetupAgenda />
    </main>
  )
}
