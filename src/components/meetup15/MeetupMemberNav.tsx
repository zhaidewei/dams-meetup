import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, Home, Link2, PenLine, UserRound } from 'lucide-react'

const links = [
  { href: '/feed', label: '讨论区', icon: Home },
  { href: '/agenda', label: '议程', icon: CalendarDays },
  { href: '/me', label: '我的', icon: UserRound },
  { href: '/recovery-link', label: '恢复链接', icon: Link2 },
] as const

type MemberPage = (typeof links)[number]['href']

function MeetupMemberNav({ active, mobile = false }: { active: MemberPage; mobile?: boolean }) {
  return (
    <nav aria-label={mobile ? '手机论坛导航' : '论坛导航'} className={mobile
      ? 'fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 gap-1 border-t border-sky-100 bg-white/95 px-3 pt-1 pb-[max(.25rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden'
      : 'grid gap-1'}>
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={href === active ? 'page' : undefined}
          className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-full px-3 text-xs font-medium hover:bg-sky-50 aria-[current=page]:bg-sky-100 aria-[current=page]:font-semibold aria-[current=page]:text-sky-900 md:flex-row md:justify-start md:gap-3 md:text-sm">
          <Icon size={19} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function MeetupMemberLayout({ active, children, sidebar }: { active: MemberPage; children: ReactNode; sidebar?: ReactNode }) {
  return (
    <div className={'mx-auto grid min-h-dvh max-w-7xl grid-cols-1 text-slate-900 md:grid-cols-[10rem_minmax(0,1fr)] ' +
      (sidebar ? 'lg:grid-cols-[12rem_minmax(0,1fr)_17rem] xl:grid-cols-[13rem_minmax(0,1fr)_19rem]'
        : 'lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)]')}>
      <aside className="hidden px-4 pt-5 md:block">
        <div className="sticky top-5 space-y-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-wide">
            <span className="grid size-10 place-items-center rounded-xl bg-sky-700 text-lg text-white" aria-hidden>D</span>
            <span>DAMS <small className="block text-xs font-medium tracking-normal text-slate-600">Meetup 15</small></span>
          </Link>
          <MeetupMemberNav active={active} />
          {active === '/feed' && <a href="#feed-compose" className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800">
            <PenLine size={16} aria-hidden />发帖
          </a>}
        </div>
      </aside>
      <main className="min-w-0 border-sky-100 pb-20 md:border-x md:pb-0">{children}</main>
      {sidebar}
      <MeetupMemberNav active={active} mobile />
    </div>
  )
}
