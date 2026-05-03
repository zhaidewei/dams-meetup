import Link from 'next/link'
import { SECTIONS, type SectionId } from '@/lib/sections'

type Props = {
  active: SectionId
}

export function SectionTabs({ active }: Props) {
  return (
    <nav
      aria-label="板块"
      className="sticky top-[57px] z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/75"
    >
      <ul className="flex gap-1 overflow-x-auto">
        {SECTIONS.map((s) => {
          const isActive = s.id === active
          return (
            <li key={s.id} className="shrink-0">
              <Link
                href={`/feed?section=${s.id}`}
                aria-current={isActive ? 'page' : undefined}
                className={
                  'block rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ' +
                  (isActive
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')
                }
              >
                {s.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
