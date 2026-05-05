'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { createPollAction, type PollFormState } from '@/lib/actions/polls'
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POST_MAX_CHARS,
} from '@/lib/constants'
import type { SectionId } from '@/lib/sections'

const initial: PollFormState = { error: null }

// Same uncontrolled-form pattern as PostComposer (see that file for the
// iPhone-Chrome hydration story). We track only option *slot ids* in React
// state so we can add/remove rows; each input keeps its own DOM value.
export function PollComposer({
  section,
  onCancel,
}: {
  section: SectionId
  onCancel: () => void
}) {
  const [state, formAction, isPending] = useActionState(createPollAction, initial)
  const [optionIds, setOptionIds] = useState<number[]>([0, 1])
  const [bodyLen, setBodyLen] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const nextIdRef = useRef(2)

  const remaining = POST_MAX_CHARS - bodyLen
  const canAdd = optionIds.length < POLL_MAX_OPTIONS
  const canRemove = optionIds.length > POLL_MIN_OPTIONS

  useEffect(() => {
    if (!state.ok) return
    formRef.current?.reset()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate reset triggered by server action result
    setBodyLen(0)
    setOptionIds([0, 1])
    nextIdRef.current = 2
  }, [state])

  function addOption() {
    setOptionIds((prev) => [...prev, nextIdRef.current++])
  }

  function removeOption(id: number) {
    setOptionIds((prev) => prev.filter((x) => x !== id))
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm"
    >
      <input type="hidden" name="section" value={section} />
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
        defaultValue=""
        onInput={(e) => setBodyLen(e.currentTarget.value.length)}
        maxLength={POST_MAX_CHARS}
        placeholder="投票题目，例如：今晚去哪吃？"
        rows={2}
        className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
      />

      <div className="space-y-1.5">
        {optionIds.map((id, i) => (
          <div key={id} className="flex items-center gap-2">
            <span className="w-5 text-center text-xs text-zinc-500">{i + 1}</span>
            <input
              name="option"
              defaultValue=""
              placeholder={`选项 ${i + 1}`}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            {canRemove && (
              <button
                type="button"
                onClick={() => removeOption(id)}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-200"
                aria-label={`删除选项 ${i + 1}`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={addOption}
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
            className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-400"
          />
          多选
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            name="hide_results"
            className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-400"
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
          disabled={isPending}
          className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 disabled:bg-zinc-400"
        >
          {isPending ? '发布中…' : '发布投票'}
        </button>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
