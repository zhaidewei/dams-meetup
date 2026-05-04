import Link from 'next/link'
import { SECTIONS, type SectionId } from '@/lib/sections'

type Props = {
  active: SectionId
  // 当前进行中的板块（主办方覆写优先 → 议程时间表）。null 表示活动外 / 空档。
  // 当前 chip 会显示一个红色脉冲点 + LIVE 文字，让用户知道现在该往哪去。
  live?: SectionId | null
}

export function SectionTabs({ active, live }: Props) {
  return (
    <nav
      aria-label="板块"
      className="sticky top-[57px] z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/75"
    >
      <ul className="flex gap-1 overflow-x-auto">
        {SECTIONS.map((s) => {
          const isActive = s.id === active
          const isLive = live === s.id
          return (
            <li key={s.id} className="shrink-0">
              <Link
                href={`/feed?section=${s.id}`}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ' +
                  (isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')
                }
              >
                {isLive && (
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
                  </span>
                )}
                <span>{s.label}</span>
                {isLive && (
                  <span
                    className={
                      'rounded-sm px-1 py-0 text-[10px] font-bold leading-tight ' +
                      (isActive ? 'bg-rose-500 text-white' : 'bg-rose-500 text-white')
                    }
                  >
                    LIVE
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
