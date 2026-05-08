import Link from 'next/link'

type Props = {
  active?: 'feed' | 'agenda' | 'me'
  // 「我」tab 红点合计：DM 未读 + 未读回复 + 未读 AI 提及。
  unreadMeCount?: number
}

export function Header({ active = 'feed', unreadMeCount = 0 }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <a
          href="https://nl-dams.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-baseline gap-1.5 text-sm tracking-tight transition-opacity hover:opacity-80"
          title="访问 DAMS 主站"
        >
          <span className="font-bold text-blue-600">DAMS</span>
          <span className="font-semibold text-zinc-900">荷兰华人数据社群</span>
        </a>
        <nav className="flex gap-1 text-sm">
          <NavTab href="/feed" label="讨论广场" active={active === 'feed'} />
          <NavTab href="/agenda" label="议程" active={active === 'agenda'} />
          <NavTab href="/me" label="我" active={active === 'me'} badge={unreadMeCount} />
        </nav>
      </div>
    </header>
  )
}

function NavTab({
  href,
  label,
  active,
  badge = 0,
}: {
  href: string
  label: string
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={href}
      className={
        'relative rounded-lg px-2.5 py-1.5 transition-colors ' +
        (active
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-zinc-600 hover:bg-zinc-100')
      }
    >
      {label}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-medium leading-[18px] text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}
