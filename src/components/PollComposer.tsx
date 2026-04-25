'use client'

import { useActionState, useState, useTransition } from 'react'
import { createPollAction, type PollFormState } from '@/lib/actions/polls'
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POST_MAX_CHARS,
} from '@/lib/constants'

const initial: PollFormState = { error: null }

export function PollComposer({ onCancel }: { onCancel: () => void }) {
  const [state, formAction] = useActionState(createPollAction, initial)
  const [isPending, startTransition] = useTransition()
  const [body, setBody] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])

  const remaining = POST_MAX_CHARS - body.length
  const canAdd = options.length < POLL_MAX_OPTIONS
  const canRemove = options.length > POLL_MIN_OPTIONS
  const canSubmit =
    body.trim().length > 0 &&
    remaining >= 0 &&
    options.filter((o) => o.trim()).length >= POLL_MIN_OPTIONS

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
    if (!state.error) {
      setBody('')
      setOptions(['', ''])
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-900">发起投票（嘉宾）</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-zinc-600 hover:underline"
        >
          ← 回到普通发帖
        </button>
      </div>

      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={POST_MAX_CHARS}
        placeholder="投票题目，例如：今晚去哪吃？"
        rows={2}
        className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
      />

      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-center text-xs text-zinc-500">{i + 1}</span>
            <input
              name="option"
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`选项 ${i + 1}`}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            {canRemove && (
              <button
                type="button"
                onClick={() =>
                  setOptions((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-200"
                aria-label={`删除选项 ${i + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ''])}
            className="ml-7 text-xs text-zinc-700 hover:underline"
          >
            + 加选项（最多 {POLL_MAX_OPTIONS}）
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-700">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="multi"
            className="size-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
          />
          多选
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="hide_results"
            className="size-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
          />
          投票前隐藏结果
        </label>
        <span className="ml-auto text-zinc-500">截止于活动结束</span>
      </div>

      <div className="flex items-center justify-between">
        <span className={remaining < 0 ? 'text-xs text-red-500' : 'text-xs text-zinc-500'}>
          {remaining} 字
        </span>
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
        >
          {isPending ? '发布中…' : '发布投票'}
        </button>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
