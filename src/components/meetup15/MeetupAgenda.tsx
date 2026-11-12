import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { MEETUP_ADDRESS, MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_THEME, MEETUP_VENUE, meetupDiscussionPath } from '@/lib/meetup15/event'

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

export function MeetupAgenda({ linkToDiscussion = false }: { linkToDiscussion?: boolean }) {
  return (
    <section id="agenda" aria-labelledby="agenda-title" className="space-y-5">
      <h2 id="agenda-title" className="text-2xl font-semibold">活动议程</h2>
      <ol className="divide-y divide-dams-line overflow-hidden rounded-2xl border border-dams-line bg-white">
        {MEETUP_AGENDA.map(({ start, end, section, title, details }) => (
          <li key={start} className={`relative grid gap-2 px-4 py-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:px-5 ${linkToDiscussion ? 'hover:bg-dams-wash' : ''}`}>
            <span className="text-sm font-medium tabular-nums text-dams-blue">{start}–{end}</span>
            <div className="space-y-2">
              <h3 className="font-semibold">
                {linkToDiscussion ? (
                  <Link href={meetupDiscussionPath(section)}
                    className="flex items-start justify-between gap-2 text-dams-hover after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-dams-blue">
                    {title}
                    <span className="sr-only">，进入{section === 'lounge' ? '自由讨论区' : '议程讨论区'}</span>
                    <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0" />
                  </Link>
                ) : title}
              </h3>
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
