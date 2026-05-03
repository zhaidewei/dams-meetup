'use client'

import { useActionState, useMemo, useRef, useState, useTransition } from 'react'
import {
  createReplyAction,
  deleteReplyAction,
  updateReplyAction,
  type ReplyFormState,
} from '@/lib/actions/replies'
import { REPLY_MAX_CHARS } from '@/lib/constants'
import { displayName, displayMeta } from '@/lib/display'

const initial: ReplyFormState = { error: null }

export type ReplyDisplay = {
  id: number
  user_id: string | null
  parent_reply_id: number | null
  body: string
  created_at: string
  updated_at: string | null
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
  viewerId: string
}

function nameOf(a: ReplyDisplay['author']): string {
  if (!a) return '匿名'
  return displayName(a)
}

export function ReplySection({ postId, count, replies, viewerId }: Props) {
  const [open, setOpen] = useState(count > 0)
  const [state, formAction] = useActionState(createReplyAction, initial)
  const [, startTransition] = useTransition()
  const [body, setBody] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: number; name: string } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const remaining = REPLY_MAX_CHARS - body.length

  const { topLevel, childrenByParent } = useMemo(() => {
    const top: ReplyDisplay[] = []
    const childMap = new Map<number, ReplyDisplay[]>()
    for (const r of replies) {
      if (r.parent_reply_id === null) {
        top.push(r)
      } else {
        const arr = childMap.get(r.parent_reply_id) ?? []
        arr.push(r)
        childMap.set(r.parent_reply_id, arr)
      }
    }
    return { topLevel: top, childrenByParent: childMap }
  }, [replies])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (body.trim().length === 0 || body.length > REPLY_MAX_CHARS) return
    const fd = new FormData(e.currentTarget)
    startTransition(() => {
      formAction(fd)
    })
    setBody('')
    setReplyingTo(null)
  }

  function onReplyTo(id: number, name: string) {
    setReplyingTo({ id, name })
    const mention = `@${name} `
    setBody((prev) => (prev.startsWith(mention) ? prev : mention + prev.replace(/^@\S+\s+/, '')))
    setOpen(true)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
  }

  function onCancelReplyingTo() {
    setReplyingTo(null)
    // Strip leading @mention from textarea since the user explicitly cancelled.
    setBody((prev) => prev.replace(/^@\S+\s+/, ''))
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
          {topLevel.map((parent) => {
            const children = childrenByParent.get(parent.id) ?? []
            return (
              <div key={parent.id} className="space-y-2">
                {parent.is_ai ? (
                  <AiReplyRow reply={parent} />
                ) : (
                  <ReplyRow
                    reply={parent}
                    viewerId={viewerId}
                    onReply={() => onReplyTo(parent.id, nameOf(parent.author))}
                  />
                )}
                {children.length > 0 && (
                  <div className="ml-3 space-y-2 border-l-2 border-zinc-200 pl-3">
                    {children.map((child) => (
                      <ReplyRow
                        key={child.id}
                        reply={child}
                        viewerId={viewerId}
                        onReply={() => onReplyTo(child.id, nameOf(child.author))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <form onSubmit={onSubmit} className="space-y-1">
            <input type="hidden" name="post_id" value={postId} />
            <input type="hidden" name="parent_reply_id" value={replyingTo?.id ?? ''} />
            {replyingTo && (
              <div className="flex items-center justify-between rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800">
                <span>
                  正在回复 <span className="font-medium">@{replyingTo.name}</span>
                </span>
                <button
                  type="button"
                  onClick={onCancelReplyingTo}
                  className="rounded px-1.5 py-0.5 text-sky-700 hover:bg-sky-100"
                  aria-label="取消回复对象"
                >
                  ✕
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
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

function ReplyRow({
  reply,
  viewerId,
  onReply,
}: {
  reply: ReplyDisplay
  viewerId: string
  onReply: () => void
}) {
  const a = reply.author
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(reply.body)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!a) return null
  const name = displayName(a)
  const meta = displayMeta(a)
  const isMine = reply.user_id !== null && reply.user_id === viewerId
  const editRemaining = REPLY_MAX_CHARS - editBody.length

  function onSaveEdit() {
    const trimmed = editBody.trim()
    if (!trimmed) {
      setError('回复不能为空')
      return
    }
    if (trimmed.length > REPLY_MAX_CHARS) {
      setError(`不能超过 ${REPLY_MAX_CHARS} 字`)
      return
    }
    startTransition(async () => {
      const res = await updateReplyAction(reply.id, trimmed)
      if (res.error) {
        setError(res.error)
      } else {
        setError(null)
        setEditing(false)
      }
    })
  }

  function onCancelEdit() {
    setEditing(false)
    setError(null)
    setEditBody(reply.body)
  }

  function onDelete() {
    if (!window.confirm('删除这条回复？')) return
    startTransition(async () => {
      const res = await deleteReplyAction(reply.id)
      if (res.error) setError(res.error)
    })
  }

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
        {reply.updated_at && <span className="text-zinc-400">已编辑</span>}
        <div className="ml-auto flex items-center gap-1">
          {!editing && (
            <button
              type="button"
              onClick={onReply}
              className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
            >
              回复
            </button>
          )}
          {!editing && isMine && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
              >
                编辑
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                删除
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-1">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            maxLength={REPLY_MAX_CHARS}
            rows={2}
            className="w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className={editRemaining < 0 ? 'text-red-500' : ''}>
              {editRemaining < 0 ? editRemaining : ''}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={pending}
                className="rounded-md px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={pending || editBody.trim().length === 0 || editRemaining < 0}
                className="rounded-md bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                {pending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <ReplyBody body={reply.body} />
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function ReplyBody({ body }: { body: string }) {
  const m = body.match(/^(@\S+)(\s+)([\s\S]*)$/)
  if (!m) return <p className="whitespace-pre-wrap text-zinc-800">{body}</p>
  return (
    <p className="whitespace-pre-wrap text-zinc-800">
      <span className="font-medium text-sky-700">{m[1]}</span>
      {m[2]}
      {m[3]}
    </p>
  )
}

function AiReplyRow({ reply }: { reply: ReplyDisplay }) {
  const m = reply.mentioned_user
  const targetName = m ? displayName(m) : null
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
