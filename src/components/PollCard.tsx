'use client'

import { useActionState, useState, useTransition } from 'react'
import { voteAction, type VoteFormState } from '@/lib/actions/polls'
import type { PollOption } from '@/lib/types'

const initial: VoteFormState = { error: null }

type Props = {
  postId: number
  options: PollOption[]
  multi: boolean
  hideResults: boolean
  closed: boolean
  totalVotes: number
  optionCounts: Record<number, number>
  myVoteOptions: number[]
}

export function PollCard({
  postId,
  options,
  multi,
  hideResults,
  closed,
  totalVotes,
  optionCounts,
  myVoteOptions,
}: Props) {
  const hasVoted = myVoteOptions.length > 0
  // Hide raw counts only when: hide_results enabled, not closed, not voted yet.
  const showCounts = closed || hasVoted || !hideResults

  const [state, formAction] = useActionState(voteAction, initial)
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<number[]>(myVoteOptions)

  function toggle(oid: number) {
    if (closed) return
    if (multi) {
      setSelected((prev) =>
        prev.includes(oid) ? prev.filter((x) => x !== oid) : [...prev, oid],
      )
    } else {
      setSelected([oid])
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (selected.length === 0 || closed) return
    const fd = new FormData()
    fd.set('post_id', String(postId))
    selected.forEach((oid) => fd.append('option_id', String(oid)))
    startTransition(() => formAction(fd))
  }

  return (
    <form onSubmit={onSubmit} className="mt-1 space-y-2">
      <div className="space-y-1.5">
        {options.map((opt) => {
          const count = optionCounts[opt.id] ?? 0
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const isSelected = selected.includes(opt.id)
          const isMine = myVoteOptions.includes(opt.id)

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              disabled={closed}
              className={
                'relative w-full overflow-hidden rounded-md border px-3 py-2 text-left text-sm transition-colors ' +
                (isSelected
                  ? 'border-zinc-900 bg-white'
                  : 'border-zinc-200 bg-white hover:border-zinc-400') +
                (closed ? ' cursor-default' : '')
              }
            >
              {showCounts && (
                <span
                  aria-hidden
                  className={
                    'absolute inset-y-0 left-0 ' +
                    (isMine ? 'bg-zinc-900/10' : 'bg-zinc-200/60')
                  }
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <span
                  className={
                    'inline-flex size-4 shrink-0 items-center justify-center ' +
                    (multi ? 'rounded-sm' : 'rounded-full') +
                    ' border ' +
                    (isSelected
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-300 bg-white')
                  }
                >
                  {isSelected && <span className="text-[10px] leading-none">✓</span>}
                </span>
                <span className="flex-1 text-zinc-900">{opt.label}</span>
                {showCounts && (
                  <span className="shrink-0 text-xs tabular-nums text-zinc-600">
                    {count} · {pct}%
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {totalVotes} 票 · {multi ? '多选' : '单选'}
          {closed
            ? ' · 已截止'
            : hideResults && !hasVoted
              ? ' · 投票后看结果'
              : ''}
        </span>
        {!closed && (
          <button
            type="submit"
            disabled={selected.length === 0 || isPending}
            className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {isPending ? '提交中…' : hasVoted ? '改投' : '投票'}
          </button>
        )}
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  )
}
