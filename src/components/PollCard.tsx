'use client'

import { useActionState } from 'react'
import {
  closePollAction,
  voteAction,
  type ClosePollFormState,
  type VoteFormState,
} from '@/lib/actions/polls'
import type { PollOption } from '@/lib/types'

const initial: VoteFormState = { error: null }
const closeInitial: ClosePollFormState = { error: null }

type Props = {
  postId: number
  options: PollOption[]
  multi: boolean
  hideResults: boolean
  closed: boolean
  canClose: boolean
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
  canClose,
  totalVotes,
  optionCounts,
  myVoteOptions,
}: Props) {
  const hasVoted = myVoteOptions.length > 0
  const showCounts = closed || hasVoted || !hideResults
  const [state, formAction, isPending] = useActionState(voteAction, initial)
  const [closeState, closeFormAction, isClosing] = useActionState(
    closePollAction,
    closeInitial,
  )
  const inputType = multi ? 'checkbox' : 'radio'
  const showCloseButton = !closed && canClose

  return (
    <div className="mt-1 space-y-2">
    <form action={formAction} className="space-y-2">
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
                'relative block w-full cursor-pointer overflow-hidden rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm transition-colors has-[:checked]:border-indigo-500 has-[:checked]:ring-1 has-[:checked]:ring-indigo-300' +
                (closed ? ' cursor-default' : '')
              }
            >
              {showCounts && (
                <span
                  aria-hidden
                  className={
                    'pointer-events-none absolute inset-y-0 left-0 ' +
                    (isMine ? 'bg-indigo-500/15' : 'bg-zinc-200/60')
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
                    'inline-flex size-4 shrink-0 items-center justify-center border border-zinc-300 bg-white peer-checked:border-indigo-600 peer-checked:bg-indigo-600 ' +
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
            className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:bg-zinc-300"
          >
            {isPending ? '提交中…' : hasVoted ? '改投' : '投票'}
          </button>
        )}
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
      {showCloseButton && (
        <form action={closeFormAction} className="flex items-center justify-end gap-2">
          <input type="hidden" name="post_id" value={postId} />
          {closeState.error && (
            <span className="text-xs text-red-600">{closeState.error}</span>
          )}
          <button
            type="submit"
            disabled={isClosing}
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {isClosing ? '关闭中…' : '立即截止'}
          </button>
        </form>
      )}
    </div>
  )
}
