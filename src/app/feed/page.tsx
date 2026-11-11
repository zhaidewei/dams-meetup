import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DiscussionFeed } from '@/components/meetup15/DiscussionFeed'
import { MeetupMemberLayout } from '@/components/meetup15/MeetupMemberNav'
import { MeetupPresence } from '@/components/meetup15/MeetupPresence'
import { MEETUP_AGENDA, MEETUP_THEME, MEETUP_VENUE, meetupAgendaAt, meetupNow } from '@/lib/meetup15/event'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '讨论区 · DAMS 第 15 期 Meetup' }

export default async function FeedPage() {
  const now = meetupNow(meetupEnv())
  const member = await currentMember(now)
  if (!member) redirect('/')
  const current = meetupAgendaAt(now)

  return (
    <MeetupMemberLayout active="/feed" sidebar={(
      <aside className="hidden min-w-0 px-4 pt-5 lg:block">
        <div className="sticky top-5 space-y-4">
          <div className="rounded-2xl bg-dams-wash p-5">
            <p className="text-xs font-semibold text-dams-hover">11 月 14 日 · Delft</p>
            <h2 className="mt-1 text-lg leading-snug font-bold">{MEETUP_THEME}</h2>
            <p className="mt-2 text-xs text-slate-600">{MEETUP_VENUE}</p>
          </div>
          <section aria-labelledby="feed-agenda" className="rounded-2xl border border-dams-line p-4">
            <h2 id="feed-agenda" className="mb-2 font-bold">现场议程</h2>
            <ol className="divide-y divide-dams-line">
              {MEETUP_AGENDA.map(({ start, title }) => (
                <li key={start} aria-current={current?.start === start ? 'step' : undefined}
                  className="grid grid-cols-[2.6rem_1fr] gap-2 py-2.5 text-xs aria-[current=step]:font-bold aria-[current=step]:text-dams-blue">
                  <time className="tabular-nums">{start}</time><span>{title}</span>
                </li>
              ))}
            </ol>
            <Link href="/agenda" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-dams-blue hover:underline">完整议程</Link>
          </section>
        </div>
      </aside>
    )}>
      <MeetupPresence />
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">讨论区</h1>
          <p className="text-xs text-slate-600">荷兰华人数据社群 · 第 15 期 Meetup</p>
        </div>
        <a href="#feed-compose" className="rounded-full bg-dams-blue px-4 py-2 text-sm font-semibold text-white md:hidden">发帖</a>
        {member.role === 'guest' && <span className="rounded-full bg-dams-selection px-3 py-1 text-xs font-medium text-dams-hover">嘉宾</span>}
      </header>
      <DiscussionFeed />
    </MeetupMemberLayout>
  )
}
