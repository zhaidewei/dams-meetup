import Link from 'next/link'
import { EVENT_NAME } from '@/lib/constants'

type Props = {
  active?: 'feed' | 'me' | 'matches'
}

export function Header({ active = 'feed' }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <Link href="/feed" className="text-sm font-semibold tracking-tight">
          {EVENT_NAME}
        </Link>
        <nav className="flex gap-1 text-sm">
          <NavTab href="/feed" label="时间线" active={active === 'feed'} />
          <NavTab href="/me" label="我" active={active === 'me'} />
          <NavTab href="/matches" label="撮合" active={active === 'matches'} />
        </nav>
      </div>
    </header>
  )
}

function NavTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={
        'rounded-md px-2.5 py-1.5 transition-colors ' +
        (active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')
      }
    >
      {label}
    </Link>
  )
}
