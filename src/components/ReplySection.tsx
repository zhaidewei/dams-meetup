'use client'

import { useActionState, useState, useTransition } from 'react'
import { createReplyAction, type ReplyFormState } from '@/lib/actions/replies'
import { REPLY_MAX_CHARS } from '@/lib/constants'

const initial: ReplyFormState = { error: null }

export type ReplyDisplay = {
  id: number
  body: string
  created_at: string
  is_ai: boolean
  author: {
    nickname: string | null
    company: string | null
    is_vip: boolean
    vip_name: string | null
    vip_title: string | null
  } | null
  mentioned_user: {
    id: string
    nickname: string | null
    is_vip: boolean
    vip_name: string | null
  } | null
}

type Props = {
  postId: number
  count: number
  replies: ReplyDisplay[]
}

export function ReplySection({ postId, count, replies }: Props) {
  const [open, setOpen] = useState(count > 0)
  const [state, formAction] = useActionState(createReplyAction, initial)
  const [, startTransition] = useTransition()
  const [body, setBody] = useState('')

  const remaining = REPLY_MAX_CHARS - body.length

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (body.trim().length === 0 || body.length > REPLY_MAX_CHARS) return
    const fd = new FormData(e.currentTarget)
    startTransition(() => {
      formAction(fd)
    })
    setBody('')
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
      >
        <span>💬</span>
        <span>{count}</span>
        <span className="text-xs text-zinc-400">{open ? '收起' : '查看回复'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {replies.map((r) =>
            r.is_ai ? <AiReplyRow key={r.id} reply={r} /> : <ReplyRow key={r.id} reply={r} />,
          )}

          <form onSubmit={onSubmit} className="space-y-1">
            <input type="hidden" name="post_id" value={postId} />
            <textarea
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={REPLY_MAX_CHARS}
              placeholder="写回复…"
              rows={2}
              className="w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-0"
            />
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{remaining < 0 ? <span className="text-red-500">{remaining}</span> : null}</span>
              <button
                type="submit"
                disabled={body.trim().length === 0 || remaining < 0}
                className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                回复
              </button>
            </div>
            {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          </form>
        </div>
      )}
    </div>
  )
}

function ReplyRow({ reply }: { reply: ReplyDisplay }) {
  const a = reply.author
  if (!a) return null
  const name = a.is_vip ? a.vip_name ?? '嘉宾' : a.nickname ?? '匿名'
  const meta = a.is_vip ? a.vip_title : a.company
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
      <div className="mb-0.5 flex items-baseline gap-2 text-xs">
        <span className="font-medium text-zinc-700">{name}</span>
        {meta && <span className="text-zinc-500">· {meta}</span>}
        {a.is_vip && (
          <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-800">
            嘉宾
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-zinc-800">{reply.body}</p>
    </div>
  )
}

function AiReplyRow({ reply }: { reply: ReplyDisplay }) {
  const m = reply.mentioned_user
  const targetName = m
    ? m.is_vip
      ? m.vip_name ?? '嘉宾'
      : m.nickname ?? '匿名'
    : null
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <span aria-hidden>🤖</span>
        <span className="font-medium text-sky-900">AI 撮合</span>
        <span className="rounded-full bg-sky-100 px-1.5 py-px text-[10px] text-sky-800">
          仅你可见
        </span>
        {targetName && (
          <span className="text-sky-700">推荐：{targetName}</span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-zinc-800">{reply.body}</p>
    </div>
  )
}
