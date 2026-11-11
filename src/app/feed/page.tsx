import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PenLine } from 'lucide-react'
import { DiscussionFeed } from '@/components/meetup15/DiscussionFeed'
import { MeetupMemberNav } from '@/components/meetup15/MeetupMemberNav'
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
    <div className="mx-auto grid min-h-dvh max-w-7xl grid-cols-1 text-slate-900 md:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)_17rem] xl:grid-cols-[13rem_minmax(0,1fr)_19rem]">
      <MeetupPresence />
      <aside className="hidden px-4 pt-5 md:block">
        <div className="sticky top-5 space-y-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-wide">
            <span className="grid size-10 place-items-center rounded-xl bg-sky-700 text-lg text-white" aria-hidden>D</span>
            <span>DAMS <small className="block text-xs font-medium tracking-normal text-slate-600">Meetup 15</small></span>
          </Link>
          <MeetupMemberNav />
          <a href="#feed-compose" className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800">
            <PenLine size={16} aria-hidden />发帖
          </a>
        </div>
      </aside>
      <main className="min-w-0 border-sky-100 pb-20 md:border-x md:pb-0">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">讨论区</h1>
            <p className="text-xs text-slate-600">荷兰华人数据社群 · 第 15 期 Meetup</p>
          </div>
          <a href="#feed-compose" className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white md:hidden">发帖</a>
          {member.role === 'guest' && <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-900">嘉宾</span>}
        </header>
        <DiscussionFeed />
      </main>
      <aside className="hidden min-w-0 px-4 pt-5 lg:block">
        <div className="sticky top-5 space-y-4">
          <div className="rounded-2xl bg-sky-50 p-5">
            <p className="text-xs font-semibold text-sky-900">11 月 14 日 · Delft</p>
            <h2 className="mt-1 text-lg leading-snug font-bold">{MEETUP_THEME}</h2>
            <p className="mt-2 text-xs text-slate-600">{MEETUP_VENUE}</p>
          </div>
          <section aria-labelledby="feed-agenda" className="rounded-2xl border border-sky-100 p-4">
            <h2 id="feed-agenda" className="mb-2 font-bold">现场议程</h2>
            <ol className="divide-y divide-sky-100">
              {MEETUP_AGENDA.map(({ start, title }) => (
                <li key={start} aria-current={current?.start === start ? 'step' : undefined}
                  className="grid grid-cols-[2.6rem_1fr] gap-2 py-2.5 text-xs aria-[current=step]:font-bold aria-[current=step]:text-sky-800">
                  <time className="tabular-nums">{start}</time><span>{title}</span>
                </li>
              ))}
            </ol>
            <Link href="/agenda" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-sky-800 hover:underline">完整议程</Link>
          </section>
        </div>
      </aside>
      <MeetupMemberNav mobile />
    </div>
  )
}
