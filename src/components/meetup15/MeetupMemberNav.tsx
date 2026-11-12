import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, House, MessageCircle, UserRound } from 'lucide-react'

const links = [
  { href: '/', label: '首页', icon: House },
  { href: '/feed?view=free', label: '自由讨论区', icon: MessageCircle },
  { href: '/feed', label: '议程讨论区', icon: CalendarDays },
  { href: '/me', label: '我的', icon: UserRound },
] as const

type MemberPage = (typeof links)[number]['href']

function MeetupMemberNav({ active, mobile = false }: { active: MemberPage; mobile?: boolean }) {
  return (
    <nav aria-label={mobile ? '手机论坛导航' : '论坛导航'} className={mobile
      ? 'meetup-mobile-nav sticky top-0 z-20 col-span-full grid grid-cols-4 gap-1 self-start border-b border-dams-line bg-white px-2 py-2 md:hidden'
      : 'grid gap-1'}>
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={href === active ? 'page' : undefined}
          className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center text-xs md:px-3 md:text-left font-medium hover:bg-dams-wash aria-[current=page]:bg-dams-selection aria-[current=page]:font-semibold aria-[current=page]:text-dams-hover md:flex-row md:justify-start md:gap-3 md:text-sm">
          <Icon size={19} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function MeetupMemberLayout({ active, children }: { active: MemberPage; children: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-5xl grid-cols-1 grid-rows-[auto_1fr] text-slate-900 md:grid-rows-1 md:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)]">
      <aside className="hidden px-4 pt-5 md:block">
        <div className="sticky top-5 space-y-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-wide">
            <span className="grid size-10 place-items-center rounded-xl bg-dams-blue text-lg text-white" aria-hidden>D</span>
            <span>DAMS <small className="block text-xs font-medium tracking-normal text-slate-600">Meetup 15</small></span>
          </Link>
          <MeetupMemberNav active={active} />
        </div>
      </aside>
      <MeetupMemberNav active={active} mobile />
      <main className="min-w-0 border-dams-line pb-[max(1rem,env(safe-area-inset-bottom))] md:border-x">{children}</main>
    </div>
  )
}
