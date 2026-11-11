import Link from 'next/link'
import { CalendarDays, Home, Mail, UserRound } from 'lucide-react'

const links = [
  { href: '/feed', label: '讨论区', icon: Home },
  { href: '/agenda', label: '议程', icon: CalendarDays },
  { href: '/me?view=messages', label: '私信', icon: Mail },
  { href: '/me', label: '我的', icon: UserRound },
]

export function MeetupMemberNav({ active = '/feed', mobile = false }: { active?: string; mobile?: boolean }) {
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
