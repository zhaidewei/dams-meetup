'use client'

// AI 撮合下一轮倒计时。cron 是 */30 * * * *（migration 0009），
// 每小时 :00 / :30 触发一次。倒计时本质 = 距离下一个 :00 / :30 的 mm:ss。
// SSR 输出占位（避免 hydration mismatch），mount 后再渲染真实秒针。

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

const SLOT_MS = 30 * 60 * 1000

function msUntilNextSlot(now: number): number {
  const d = new Date(now)
  const intoSlot =
    ((d.getMinutes() % 30) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds()
  return SLOT_MS - intoSlot
}

function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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

export function MatchCountdown({
  size = 'md',
  variant = 'light',
}: {
  size?: keyof typeof SIZE_CLASSES
  variant?: Variant
}) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setRemaining(msUntilNextSlot(Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span
      className={`inline-flex items-center rounded-full tabular-nums ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]}`}
      title="AI 撮合每 30 分钟自动跑一轮"
    >
      <Sparkles className={`${ICON_CLASSES[size]} shrink-0`} aria-hidden />
      <span>下一轮 AI 撮合 {remaining === null ? '--:--' : formatMmSs(remaining)}</span>
    </span>
  )
}
