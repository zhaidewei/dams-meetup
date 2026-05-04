'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, Radio } from 'lucide-react'
import { EVENT_NAME, EVENT_END_ISO, EVENT_START_ISO } from '@/lib/constants'
import {
  SECTION_META,
  sectionLabel,
  sectionTimeRange,
  type SectionId,
} from '@/lib/sections'

type Props = {
  liveSection: SectionId | null
}

// SSR 时不渲染倒计时文字（避免 server/client 时间差导致 hydration mismatch），
// 用 useEffect 挂载后再填上。LIVE 板块块在 server 已确定，可直接渲染。
export function EventHero({ liveSection }: Props) {
  const [countdown, setCountdown] = useState<string | null>(null)

  useEffect(() => {
    function tick() {
      setCountdown(formatCountdown())
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  const liveMeta = liveSection ? SECTION_META[liveSection] : null

  return (
    <section className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">
            DAMS
          </p>
          <h1 className="text-base font-semibold text-zinc-900">{EVENT_NAME}</h1>
        </div>
        {countdown && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200">
            <Clock className="size-3.5" aria-hidden />
            {countdown}
          </span>
        )}
      </div>

      {liveSection && liveMeta ? (
        <Link
          href={`/feed?section=${liveSection}`}
          className="mt-3 flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm text-zinc-700 ring-1 ring-indigo-100 transition-colors hover:bg-white"
        >
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
          </span>
          <span className="font-semibold text-rose-600">LIVE</span>
          <span className="truncate">
            {sectionLabel(liveSection)} · {sectionTimeRange(liveSection)}
            {liveMeta.speaker && ` · ${liveMeta.speaker}`}
          </span>
        </Link>
      ) : (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-xs text-zinc-500 ring-1 ring-zinc-100">
          <Radio className="size-3.5" aria-hidden />
          活动暂未进入演讲时段
        </p>
      )}
    </section>
  )
}

function formatCountdown(): string {
  const now = Date.now()
  const start = Date.parse(EVENT_START_ISO)
  const end = Date.parse(EVENT_END_ISO)
  if (now < start) return `距开场 ${human(start - now)}`
  if (now < end) return `距结束 ${human(end - now)}`
  return '活动已结束'
}

function human(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}
