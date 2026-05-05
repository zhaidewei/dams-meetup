'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { createQuestionAction, type PostFormState } from '@/lib/actions/posts'
import { POST_MAX_CHARS } from '@/lib/constants'

const initial: PostFormState = { error: null }

type Props = {
  hostName: string
  hostTitle: string | null
  defaultNickname: string | null
  defaultCompany: string | null
}

// 观众端 QA 提问入口。仅在 event_state.screen_mode='qa' 时由 /feed 渲染在
// PostComposer 上方。设计上和 PostComposer 同样走 uncontrolled form +
// React 19 form action（iPhone Chrome 上 onSubmit 会被 hydration 失败掐死，
// progressive enhancement 是兜底）。
export function QuestionComposer({
  hostName,
  hostTitle,
  defaultNickname,
  defaultCompany,
}: Props) {
  const [state, formAction, isPending] = useActionState(createQuestionAction, initial)
  const [bodyLen, setBodyLen] = useState(0)
  const [identityOpen, setIdentityOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!state.ok) return
    formRef.current?.reset()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors PostComposer
    setBodyLen(0)
  }, [state])

  const remaining = POST_MAX_CHARS - bodyLen

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-2xl border-2 border-rose-300 bg-rose-50/60 p-4 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Mic className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
        <div className="flex-1 leading-tight">
          <p className="text-sm font-semibold text-rose-900">
            向「{hostName}」提问
            {hostTitle && <span className="ml-1 text-xs font-normal text-rose-700">· {hostTitle}</span>}
          </p>
          <p className="mt-0.5 text-xs text-rose-700">
            提问会在大屏滚动展示，按点赞排序。嘉宾会从大屏读到。
          </p>
        </div>
      </div>

      <textarea
        name="body"
        defaultValue=""
        onInput={(e) => setBodyLen(e.currentTarget.value.length)}
        maxLength={POST_MAX_CHARS}
        placeholder={`想问 ${hostName} 什么？`}
        rows={3}
        className="w-full resize-none rounded-md border border-rose-200 bg-white p-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-rose-400 focus:outline-none"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <button
          type="button"
          onClick={() => setIdentityOpen((v) => !v)}
          className="rounded-md px-2 py-1 text-rose-700 hover:bg-rose-100"
        >
          {defaultNickname ? defaultNickname : '匿名'}
          {defaultCompany && ` · ${defaultCompany}`}
          <span className="ml-1 text-zinc-400">{identityOpen ? '收起' : '编辑身份'}</span>
        </button>
        <span className={remaining < 0 ? 'text-red-500' : ''}>{remaining}</span>
      </div>

      {identityOpen && (
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-white/70 p-3 sm:grid-cols-2">
          <input
            name="nickname"
            defaultValue={defaultNickname ?? ''}
            placeholder="昵称（留空显示为匿名）"
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          <input
            name="company"
            defaultValue={defaultCompany ?? ''}
            placeholder="公司"
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-700 disabled:bg-zinc-400"
        >
          {isPending ? '发送中…' : '提问'}
        </button>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
