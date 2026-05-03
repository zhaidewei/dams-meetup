'use client'

import { useActionState } from 'react'
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

// Native <input type="checkbox|radio"> + form action: voting works even when
// React event handlers don't bind (iPhone Chrome hydration issue, see
// PostComposer). Browser collects checked option_id values into FormData
// natively; selection visuals are driven by CSS :checked / peer-checked.
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
  const showCounts = closed || hasVoted || !hideResults
  const [state, formAction, isPending] = useActionState(voteAction, initial)
  const inputType = multi ? 'checkbox' : 'radio'

  return (
    <form action={formAction} className="mt-1 space-y-2">
      <input type="hidden" name="post_id" value={postId} />
      <div className="space-y-1.5">
        {options.map((opt) => {
          const count = optionCounts[opt.id] ?? 0
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const isMine = myVoteOptions.includes(opt.id)

          return (
            <label
              key={opt.id}
              className={
                'relative block w-full cursor-pointer overflow-hidden rounded-md border border-zinc-200 bg-white px-3 py-2 text-left text-sm transition-colors has-[:checked]:border-zinc-900' +
                (closed ? ' cursor-default' : '')
              }
            >
              {showCounts && (
                <span
                  aria-hidden
                  className={
                    'pointer-events-none absolute inset-y-0 left-0 ' +
                    (isMine ? 'bg-zinc-900/10' : 'bg-zinc-200/60')
                  }
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <input
                  type={inputType}
                  name="option_id"
                  value={opt.id}
                  defaultChecked={isMine}
                  disabled={closed}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={
                    'inline-flex size-4 shrink-0 items-center justify-center border border-zinc-300 bg-white peer-checked:border-zinc-900 peer-checked:bg-zinc-900 ' +
                    (multi ? 'rounded-sm' : 'rounded-full')
                  }
                />
                <span className="flex-1 text-zinc-900">{opt.label}</span>
                {showCounts && (
                  <span className="shrink-0 text-xs tabular-nums text-zinc-600">
                    {count} · {pct}%
                  </span>
                )}
              </span>
            </label>
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
            disabled={isPending}
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
