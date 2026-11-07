import Link from 'next/link'
import { MEETUP_ADDRESS, MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_THEME, MEETUP_VENUE } from '@/lib/meetup15/event'

export function MeetupNav({ closed = false }: { closed?: boolean }) {
  return (
    <nav aria-label="活动导航" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-zinc-200 pb-4 text-sm font-medium">
      <Link href="/">活动首页</Link>
      <Link href="/agenda">完整议程</Link>
      {closed ? <Link href="/summary/15">活动复盘</Link> : <>
        <Link href="/feed">互动区</Link>
        <Link href="/me">我</Link>
      </>}
    </nav>
  )
}

export function MeetupHeading() {
  return (
    <header className="space-y-3">
      <p className="text-sm font-semibold text-teal-800">{MEETUP_NAME}</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{MEETUP_THEME}</h1>
      <p className="font-medium">{MEETUP_DATE}</p>
      <p className="text-sm leading-relaxed text-zinc-600">{MEETUP_VENUE}<br />{MEETUP_ADDRESS}</p>
    </header>
  )
}

export function MeetupAgenda() {
  return (
    <section aria-labelledby="agenda-title" className="space-y-5">
      <h2 id="agenda-title" className="text-2xl font-semibold">活动议程</h2>
      <ol className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {MEETUP_AGENDA.map(({ start, end, title, details }) => (
          <li key={start} className="grid gap-2 px-5 py-4 sm:grid-cols-[8rem_1fr]">
            <span className="text-sm font-medium tabular-nums text-teal-800">{start}–{end}</span>
            <div className="space-y-2">
              <h3 className="font-semibold">{title}</h3>
              {details && (
                <ul className="space-y-1 text-sm leading-relaxed text-zinc-600">
                  {details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
