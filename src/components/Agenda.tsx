import type { SectionId } from '@/lib/sections'
import { AGENDA } from '@/lib/agenda'

type Props = {
  // 当前进行中的板块（来自主办方控制台或议程时间表）。null 表示活动外 / 空档。
  // 对应的 row（或 row 内 talk）会显示 LIVE 圆点。
  liveSection?: SectionId | null
}

export function Agenda({ liveSection = null }: Props) {
  return (
    <section aria-label="活动议程" className="space-y-4">
      <h2 className="text-center text-sm font-medium tracking-wide text-zinc-500">
        活动议程 · 2026-05-09
      </h2>
      <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
        {AGENDA.map((item) => {
          const rowLive = item.sectionId !== undefined && item.sectionId === liveSection
          return (
            <li
              key={item.time}
              className={
                'grid grid-cols-[7rem_1fr] gap-4 px-4 py-3 sm:px-5 ' +
                (rowLive ? 'bg-rose-50/60' : '')
              }
            >
              <span className="text-sm tabular-nums text-zinc-500">{item.time}</span>
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  {rowLive && <LiveBadge />}
                  <span>{item.title}</span>
                </p>
                {item.talks && (
                  <ul className="space-y-1.5">
                    {item.talks.map((t) => {
                      const talkLive = t.sectionId !== undefined && t.sectionId === liveSection
                      return (
                        <li
                          key={t.topic}
                          className={
                            'flex flex-wrap items-baseline gap-x-2 text-sm ' +
                            (talkLive ? 'text-zinc-900' : 'text-zinc-700')
                          }
                        >
                          {talkLive && <LiveBadge />}
                          <span>{t.topic}</span>
                          <span className="text-zinc-500"> — {t.speaker}，{t.affiliation}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {item.sponsors && (
                  <ul className="space-y-1 text-sm text-zinc-700">
                    {item.sponsors.map((s) => {
                      const content = (
                        <>
                          {s.italic && <em>{s.italic}</em>}
                          {s.italic && ' '}
                          {s.name}
                        </>
                      )
                      return (
                        <li key={s.name}>
                          <span className="text-zinc-500">{s.label}：</span>
                          {s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline-offset-2 hover:underline"
                            >
                              {content}
                            </a>
                          ) : (
                            content
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {item.panelists && (
                  <ul className="space-y-1 text-sm text-zinc-700">
                    {item.panelists.map((p) => (
                      <li key={p.name}>
                        {p.name}
                        <span className="text-zinc-500">，{p.role}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-rose-500 px-1 py-0 text-[10px] font-bold leading-tight text-white">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-white" />
      </span>
      LIVE
    </span>
  )
}
