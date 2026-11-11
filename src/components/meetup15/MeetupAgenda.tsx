import Link from 'next/link'
import { MEETUP_ADDRESS, MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_THEME, MEETUP_VENUE } from '@/lib/meetup15/event'

export function MeetupNav({ closed = false }: { closed?: boolean }) {
  return (
    <nav aria-label="活动导航" className="flex flex-wrap gap-x-2 rounded-xl border border-dams-line bg-white px-2 py-1 text-sm font-medium text-dams-hover [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center [&>a]:rounded-lg [&>a]:px-2 [&>a:hover]:bg-dams-wash">
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
    <header className="space-y-3 rounded-2xl bg-dams-wash p-4 sm:p-8">
      <p className="text-sm font-semibold text-dams-blue">{MEETUP_NAME}</p>
      <h1 className="text-[clamp(1.65rem,6.8vw,2.25rem)] leading-tight font-bold tracking-tight sm:text-5xl">{MEETUP_THEME}</h1>
      <p className="font-medium">{MEETUP_DATE}</p>
      <p className="wrap-anywhere text-sm leading-relaxed text-slate-600">{MEETUP_VENUE}<br />{MEETUP_ADDRESS}</p>
    </header>
  )
}

export function MeetupAgenda() {
  return (
    <section aria-labelledby="agenda-title" className="space-y-5">
      <h2 id="agenda-title" className="text-2xl font-semibold">活动议程</h2>
      <ol className="divide-y divide-dams-line overflow-hidden rounded-2xl border border-dams-line bg-white">
        {MEETUP_AGENDA.map(({ start, end, title, details }) => (
          <li key={start} className="grid gap-2 px-4 py-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:px-5">
            <span className="text-sm font-medium tabular-nums text-dams-blue">{start}–{end}</span>
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
