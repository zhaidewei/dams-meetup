'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RefreshCw, Undo2 } from 'lucide-react'
import type { ScreenQuestion } from '@/lib/queries/questions'
import { setQuestionAnsweredAction } from '@/lib/actions/posts'
import { displayName, displayMeta } from '@/lib/display'

type Props = {
  initial: ScreenQuestion[]
}

// /admin 控制台 QA 问题面板 —— 主办方在手机上直接标记 / 撤销已答。
//
// 之前订阅 posts + likes Realtime + 自动 router.refresh()，但用 useState(initial)
// 把列表锁住了，refresh 后 props 变化进不到 state，造成 "统计行实时、列表不动"
// 的不一致 bug。同时 200 人现场点赞高峰会让 admin 手机被持续 refresh 冲到卡顿。
//
// 现在改成：直接读 prop（无 state），动作后或主动按"刷新"才 router.refresh。
// 主办方有显式控制权，admin 流量也降为 0 Realtime 订阅。
export function QaQuestionPanel({ initial }: Props) {
  const questions = initial
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function refresh() {
    setError(null)
    startTransition(() => {
      router.refresh()
    })
  }

  function toggle(q: ScreenQuestion) {
    setError(null)
    setPendingId(q.id)
    const next = q.answered_at ? false : true
    startTransition(async () => {
      const res = await setQuestionAnsweredAction(q.id, next)
      setPendingId(null)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-zinc-500">数据为打开时刻 · 点刷新拉最新</p>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw className={'size-3.5 ' + (isPending ? 'animate-spin' : '')} aria-hidden />
          刷新
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {questions.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-6 text-center text-xs text-zinc-500">
          还没有人提问
        </p>
      ) : (
        <ul className="space-y-2">
          {questions.map((q) => {
            const answered = !!q.answered_at
            const name = displayName(q.author)
            const meta = displayMeta(q.author)
            return (
              <li
                key={q.id}
                className={
                  'flex items-start gap-2 rounded-md border px-3 py-2 ' +
                  (answered
                    ? 'border-zinc-200 bg-zinc-50 opacity-70'
                    : 'border-rose-200 bg-rose-50/50')
                }
              >
                <span className="mt-0.5 shrink-0 text-xs font-semibold text-rose-600 tabular-nums">
                  ❤{q.like_count}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      'whitespace-pre-wrap text-sm ' +
                      (answered ? 'text-zinc-500 line-through' : 'text-zinc-900')
                    }
                  >
                    {q.body}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {name}
                    {meta && ` · ${meta}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(q)}
                  disabled={pendingId === q.id}
                  aria-label={answered ? '撤销已答' : '标记已答'}
                  title={answered ? '撤销已答' : '标记已答'}
                  className={
                    'shrink-0 rounded-md p-2 transition-colors disabled:opacity-50 ' +
                    (answered
                      ? 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900'
                      : 'text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800')
                  }
                >
                  {answered ? <Undo2 className="size-4" /> : <Check className="size-4" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
