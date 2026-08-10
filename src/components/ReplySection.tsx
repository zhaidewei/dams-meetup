'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { MessageCircle, Sparkles, X } from 'lucide-react'
import {
  createReplyAction,
  deleteReplyAction,
  updateReplyAction,
  toggleReplyReactionAction,
  type ReplyFormState,
} from '@/lib/actions/replies'
import { REPLY_MAX_CHARS } from '@/lib/constants'
import { displayName, displayMeta } from '@/lib/display'
import { Avatar } from './Avatar'
import { UserCardTrigger } from './UserCard'

const initial: ReplyFormState = { error: null }

// Popular emojis for quick selection
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '➕']

export type ReplyReaction = {
  emoji: string
  count: number
  viewerReacted: boolean
}

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
    contact_handle: string | null
    show_contact: boolean
    is_vip: boolean
    vip_name: string | null
    vip_title: string | null
  } | null
  // AiReplyRow 把它包成 UserCardTrigger，需要全量字段以便弹层渲染联系方式 / 发私信。
  mentioned_user: {
    id: string
    nickname: string | null
    company: string | null
    contact_handle: string | null
    show_contact: boolean
    is_vip: boolean
    vip_name: string | null
    vip_title: string | null
  } | null
  reactions?: ReplyReaction[]
}

type Props = {
  postId: number
  count: number
  replies: ReplyDisplay[]
  viewerId: string
  viewerCanDm: boolean
}

function nameOf(a: ReplyDisplay['author']): string {
  if (!a) return '匿名'
  return displayName(a)
}

export function ReplySection({ postId, count, replies, viewerId, viewerCanDm }: Props) {
  const [open, setOpen] = useState(count > 0)
  const [state, formAction, isPending] = useActionState(createReplyAction, initial)
  const [replyingTo, setReplyingTo] = useState<{ id: number; name: string } | null>(null)
  const [bodyLen, setBodyLen] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const remaining = REPLY_MAX_CHARS - bodyLen

  // textarea is uncontrolled — directly read DOM value to avoid React
  // controlled-component clearing the input on iPhone Chrome (see PostComposer
  // for the full explanation).
  function syncBodyLen() {
    setBodyLen(textareaRef.current?.value.length ?? 0)
  }

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

  // Reset uncontrolled form after a successful reply submit.
  useEffect(() => {
    if (!state.ok) return
    formRef.current?.reset()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate reset of UI counter triggered by server action result
    setBodyLen(0)
    setReplyingTo(null)
  }, [state])

  function onReplyTo(id: number, name: string) {
    setReplyingTo({ id, name })
    setOpen(true)
    const el = textareaRef.current
    if (!el) return
    const mention = `@${name} `
    const cur = el.value
    if (!cur.startsWith(mention)) {
      el.value = mention + cur.replace(/^@\S+\s+/, '')
      setBodyLen(el.value.length)
    }
    requestAnimationFrame(() => {
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
  }

  function onCancelReplyingTo() {
    setReplyingTo(null)
    const el = textareaRef.current
    if (!el) return
    el.value = el.value.replace(/^@\S+\s+/, '')
    setBodyLen(el.value.length)
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
      >
        <MessageCircle className="size-4" aria-hidden />
        <span>{count}</span>
        <span className="text-xs text-zinc-400" title={open ? '收起' : '回复'}>
          {open ? '收' : '回'}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {topLevel.map((parent) => {
            const children = childrenByParent.get(parent.id) ?? []
            return (
              <div key={parent.id} className="space-y-2">
                {parent.is_ai ? (
                  <AiReplyRow
                    reply={parent}
                    viewerId={viewerId}
                    viewerCanDm={viewerCanDm}
                  />
                ) : (
                  <ReplyRow
                    reply={parent}
                    viewerId={viewerId}
                    viewerCanDm={viewerCanDm}
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
                        viewerCanDm={viewerCanDm}
                        onReply={() => onReplyTo(child.id, nameOf(child.author))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <form ref={formRef} action={formAction} className="space-y-1">
            <input type="hidden" name="post_id" value={postId} />
            <input type="hidden" name="parent_reply_id" value={replyingTo?.id ?? ''} />
            {replyingTo && (
              <div className="flex items-center justify-between rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">
                <span>
                  正在回复 <span className="font-medium">@{replyingTo.name}</span>
                </span>
                <button
                  type="button"
                  onClick={onCancelReplyingTo}
                  className="rounded p-1 text-blue-700 hover:bg-blue-100"
                  aria-label="取消回复对象"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            )}
            <textarea
              ref={textareaRef}
              name="body"
              defaultValue=""
              onInput={syncBodyLen}
              maxLength={REPLY_MAX_CHARS}
              placeholder="写回复…"
              rows={2}
              className="w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-0"
            />
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{remaining < 0 ? <span className="text-red-500">{remaining}</span> : null}</span>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
              >
                {isPending ? '发送中…' : '回复'}
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
  viewerCanDm,
  onReply,
}: {
  reply: ReplyDisplay
  viewerId: string
  viewerCanDm: boolean
  onReply: () => void
}) {
  const a = reply.author
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(reply.body)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [localReactions, setLocalReactions] = useState<ReplyReaction[]>(reply.reactions ?? [])
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  if (!a) return null
  const name = displayName(a)
  const meta = displayMeta(a)
  const isMine = reply.user_id !== null && reply.user_id === viewerId
  const editRemaining = REPLY_MAX_CHARS - editBody.length

  // Close emoji picker when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmojiPicker])

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

  function onToggleReaction(emoji: string) {
    startTransition(async () => {
      const res = await toggleReplyReactionAction(reply.id, emoji)
      if (!res.error) {
        // Optimistic update
        setLocalReactions(prev => {
          const existing = prev.find(r => r.emoji === emoji)
          if (existing) {
            if (existing.count <= 1) {
              return prev.filter(r => r.emoji !== emoji)
            }
            return prev.map(r =>
              r.emoji === emoji
                ? { ...r, count: r.count - 1, viewerReacted: false }
                : r
            )
          }
          return [...prev, { emoji, count: 1, viewerReacted: true }]
        })
      }
    })
    setShowEmojiPicker(false)
  }

  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
      <div className="mb-0.5 flex items-center gap-2 text-xs">
        <UserCardTrigger
          user={reply.user_id ? { id: reply.user_id, ...a } : null}
          viewerCanDm={viewerCanDm}
          isMine={isMine}
          className="-mx-1 flex items-center gap-1.5 px-1 py-0.5"
        >
          {reply.user_id && <Avatar seed={reply.user_id} user={a} size="xs" />}
          <span className="font-medium text-zinc-700">{name}</span>
          {meta && <span className="text-zinc-500">· {meta}</span>}
          {a.is_vip && (
            <span
              className="rounded-full bg-amber-100 px-1 py-px text-[10px] text-amber-800"
              title="嘉宾"
              aria-label="嘉宾"
            >
              宾
            </span>
          )}
        </UserCardTrigger>
        {reply.updated_at && <span className="text-zinc-400">已编辑</span>}
        <div className="ml-auto flex items-center gap-1">
          {!editing && (
            <button
              type="button"
              onClick={onReply}
              title="回复"
              aria-label="回复"
              className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
            >
              回
            </button>
          )}
          {!editing && isMine && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="编辑"
                aria-label="编辑"
                className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
              >
                编
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                title="删除"
                aria-label="删除"
                className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                删
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
            onCompositionEnd={(e) => setEditBody(e.currentTarget.value)}
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

      {/* Emoji reactions */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {localReactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => onToggleReaction(reaction.emoji)}
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition-colors ${
              reaction.viewerReacted
                ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <span>{reaction.emoji}</span>
            <span>{reaction.count}</span>
          </button>
        ))}
        
        {/* Add emoji button */}
        <div ref={emojiPickerRef} className="relative">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(v => !v)}
            className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700"
            aria-label="添加表情"
          >
            +
          </button>
          
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction(emoji)}
                  className="rounded p-1 text-lg hover:bg-zinc-100"
                  aria-label={`添加 ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function ReplyBody({ body }: { body: string }) {
  const m = body.match(/^(@\S+)(\s+)([\s\S]*)$/)
  if (!m) return <p className="whitespace-pre-wrap text-zinc-800">{body}</p>
  return (
    <p className="whitespace-pre-wrap text-zinc-800">
      <span className="font-medium text-blue-700">{m[1]}</span>
      {m[2]}
      {m[3]}
    </p>
  )
}

function AiReplyRow({
  reply,
  viewerId,
  viewerCanDm,
}: {
  reply: ReplyDisplay
  viewerId: string
  viewerCanDm: boolean
}) {
  const m = reply.mentioned_user
  const targetName = m ? displayName(m) : null
  const isMine = m ? m.id === viewerId : false
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <Sparkles className="size-3.5 self-center text-blue-700" aria-hidden />
        <span className="font-medium text-blue-900">AI 撮合</span>
        <span className="rounded-full bg-blue-100 px-1.5 py-px text-[10px] text-blue-800">
          仅你可见
        </span>
        {m && targetName && (
          <span className="inline-flex items-center gap-1 text-blue-700">
            推荐：
            <UserCardTrigger
              user={m}
              viewerCanDm={viewerCanDm}
              isMine={isMine}
              className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-blue-800"
            >
              <Avatar seed={m.id} user={m} size="sm" />
              <span className="font-medium underline decoration-dotted underline-offset-2">
                {targetName}
              </span>
            </UserCardTrigger>
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-zinc-800">{reply.body}</p>
    </div>
  )
}
