'use client'

// AI 撮合下一轮倒计时。三阶段（与 migration 0025_match_cron_phased.sql 对齐）：
//   - 活动前 (pre):  hourly @ :00 UTC          → mm:ss 距下个整点
//   - 活动中 (live): every 10 min UTC          → mm:ss 距下个 10 分钟整点
//   - 活动后 (post): daily @ 03:00 UTC ×7d     → Xh Ym 距下次 03:00 UTC
//   - 7 天后 (cleanup): cron 已停 → 不渲染
// SSR 输出占位（避免 hydration mismatch），mount 后再渲染真实秒针。

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { getEventPhase, type EventPhase } from '@/lib/constants'

const POST_CRON_HOUR_UTC = 3

function msUntilNextSlot(now: number, phase: EventPhase): number {
  const d = new Date(now)
  if (phase === 'live') {
    const slot = 10 * 60 * 1000
    const into =
      ((d.getMinutes() % 10) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds()
    return slot - into
  }
  if (phase === 'pre') {
    const slot = 60 * 60 * 1000
    const into =
      (d.getMinutes() * 60 + d.getSeconds()) * 1000 + d.getMilliseconds()
    return slot - into
  }
  // post — daily 03:00 UTC
  const next = new Date(d)
  next.setUTCMinutes(0, 0, 0)
  next.setUTCHours(POST_CRON_HOUR_UTC)
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next.getTime() - now
}

function formatRemaining(ms: number, phase: EventPhase): string {
  if (phase === 'post') {
    const totalMin = Math.max(0, Math.ceil(ms / 60_000))
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${h}h ${String(m).padStart(2, '0')}m`
  }
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const PHASE_TITLE: Record<Exclude<EventPhase, 'cleanup'>, string> = {
  pre: 'AI 撮合每小时自动跑一轮（活动前）',
  live: 'AI 撮合每 10 分钟自动跑一轮（活动中）',
  post: 'AI 撮合每天自动跑一轮（活动后 7 天）',
}

const SIZE_CLASSES = {
  sm: 'gap-1 px-2 py-0.5 text-[11px]',
  md: 'gap-1.5 px-2.5 py-1 text-xs',
  lg: 'gap-2 px-3 py-1.5 text-base',
} as const

const ICON_CLASSES = {
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-4',
} as const

type Variant = 'light' | 'dark'

const VARIANT_CLASSES: Record<Variant, string> = {
  light: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  dark: 'bg-blue-500/10 text-blue-200 ring-1 ring-blue-400/30',
}

type State =
  | { kind: 'pending' }
  | { kind: 'cleanup' }
  | { kind: 'tick'; phase: Exclude<EventPhase, 'cleanup'>; remaining: number }

export function MatchCountdown({
  size = 'md',
  variant = 'light',
}: {
  size?: keyof typeof SIZE_CLASSES
  variant?: Variant
}) {
  // 初始 'pending'：SSR 与首次 client render 一致（避免 hydration mismatch），
  // useEffect 跑一次 tick 后才会切到 'tick' 或 'cleanup'。
  const [state, setState] = useState<State>({ kind: 'pending' })

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const phase = getEventPhase(now)
      if (phase === 'cleanup') {
        setState({ kind: 'cleanup' })
        return
      }
      setState({ kind: 'tick', phase, remaining: msUntilNextSlot(now, phase) })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (state.kind === 'cleanup') return null

  const text =
    state.kind === 'pending'
      ? '--:--'
      : formatRemaining(state.remaining, state.phase)
  const title = state.kind === 'tick' ? PHASE_TITLE[state.phase] : undefined

  return (
    <span
      className={`inline-flex items-center rounded-full tabular-nums ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]}`}
      title={title}
    >
      <Sparkles className={`${ICON_CLASSES[size]} shrink-0`} aria-hidden />
      <span>下一轮 AI 撮合 {text}</span>
    </span>
  )
}
