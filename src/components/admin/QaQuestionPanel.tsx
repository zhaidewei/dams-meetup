'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Undo2 } from 'lucide-react'
import type { ScreenQuestion } from '@/lib/queries/questions'
import { setQuestionAnsweredAction } from '@/lib/actions/posts'
import { displayName, displayMeta } from '@/lib/display'
import { getBrowserSupabase } from '@/lib/supabase/client'

type Props = {
  initial: ScreenQuestion[]
}

// /admin 控制台 QA 问题面板 —— 主办方在手机上直接标记 / 撤销已答，
// 避免「请到大屏 tab hover ✓」这种桌面前提的操作路径。
//
// 数据由 server page 一次性传入，Realtime 订阅 posts INSERT/UPDATE 后
// 调用 router.refresh() 让 server 重新拉 ScreenQuestion 列表。这样
// 不需要在客户端再做 list mutation 逻辑，状态源头一致 = DB。
export function QaQuestionPanel({ initial }: Props) {
  const [questions] = useState(initial)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const sb = getBrowserSupabase()
    let timer: ReturnType<typeof setTimeout> | null = null
    function bump() {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        router.refresh()
      }, 500)
    }
    const ch = sb
      .channel('admin-qa-questions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, bump)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      sb.removeChannel(ch)
    }
  }, [router])

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

  if (questions.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-6 text-center text-xs text-zinc-500">
        还没有人提问
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-rose-600">{error}</p>}
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
    </div>
  )
}
