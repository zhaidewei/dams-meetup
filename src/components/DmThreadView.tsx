'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Phone } from 'lucide-react'
import { Avatar } from './Avatar'
import { UserCardTrigger } from './UserCard'
import { sendDmAction } from '@/lib/actions/dm'
import { DM_MAX_CHARS } from '@/lib/constants'
import { displayName, displayMeta } from '@/lib/display'
import type { DmMessageRow, PublicUserDisplay } from '@/lib/types'
import { CopyButton } from './CopyButton'

type Props = {
  threadId: number
  viewerId: string
  viewerCanSend: boolean
  viewerHasContact: boolean
  other: PublicUserDisplay
  messages: DmMessageRow[]
}

export function DmThreadView({
  threadId,
  viewerId,
  viewerCanSend,
  viewerHasContact,
  other,
  messages,
}: Props) {
  const otherName = displayName(other)
  const otherMeta = displayMeta(other)
  const [body, setBody] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const tail = useRef<HTMLDivElement | null>(null)

  // 新消息到了滚到底
  useEffect(() => {
    tail.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  const remaining = DM_MAX_CHARS - body.length

  function onSend() {
    const trimmed = body.trim()
    if (!trimmed) {
      setError('说点啥再发吧')
      return
    }
    if (trimmed.length > DM_MAX_CHARS) {
      setError(`不能超过 ${DM_MAX_CHARS} 字`)
      return
    }
    startTransition(async () => {
      const res = await sendDmAction(threadId, trimmed, reveal && viewerHasContact)
      if (res.error) {
        setError(res.error)
        return
      }
      setBody('')
      setReveal(false)
      setError(null)
    })
  }

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
        <UserCardTrigger
          user={other}
          viewerCanDm={false}
          isMine={false}
          className="flex items-center gap-3"
        >
          <Avatar seed={other.id} user={other} size="md" />
          <span className="font-semibold text-zinc-900">{otherName}</span>
          {otherMeta && <span className="text-zinc-500">· {otherMeta}</span>}
          {other.is_vip && (
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-800">
              嘉宾
            </span>
          )}
        </UserCardTrigger>
      </header>

      <div className="min-h-[40vh] space-y-2 rounded-2xl border border-zinc-200 bg-white p-3">
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">还没消息，发第一条。</p>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} mine={m.sender_id === viewerId} />
          ))
        )}
        <div ref={tail} />
      </div>

      {viewerCanSend ? (
        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={DM_MAX_CHARS}
            rows={3}
            placeholder="说点什么…"
            className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-[15px] focus:border-indigo-400 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 text-xs">
            <label
              className={
                'flex items-center gap-1.5 ' +
                (viewerHasContact ? 'text-zinc-600' : 'cursor-not-allowed text-zinc-400')
              }
              title={viewerHasContact ? '' : '到「我」填写联系方式后才能附上'}
            >
              <input
                type="checkbox"
                checked={reveal && viewerHasContact}
                onChange={(e) => setReveal(e.target.checked)}
                disabled={!viewerHasContact}
              />
              本次发送附上我的联系方式
            </label>
            <div className="flex items-center gap-2">
              <span className={remaining < 0 ? 'text-red-500' : 'text-zinc-400'}>
                {remaining < 20 ? remaining : ''}
              </span>
              <button
                type="button"
                onClick={onSend}
                disabled={pending || body.trim().length === 0 || remaining < 0}
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:bg-zinc-300"
              >
                {pending ? '发送中…' : '发送'}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-center text-sm text-zinc-500">
          请先到「我」页面设置昵称才能回复
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message, mine }: { message: DmMessageRow; mine: boolean }) {
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div className={'max-w-[80%] space-y-1 ' + (mine ? 'text-right' : 'text-left')}>
        <div
          className={
            'inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-[15px] leading-relaxed ' +
            (mine ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-800')
          }
        >
          {message.body}
        </div>
        {message.revealed_contact && (
          <div
            className={
              'inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 ' +
              (mine ? 'ml-auto' : '')
            }
          >
            <Phone className="size-3" aria-hidden />
            <span>{message.revealed_contact}</span>
            <CopyButton
              text={message.revealed_contact}
              className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-amber-50 active:bg-amber-100"
            />
          </div>
        )}
        <div className="text-[10px] text-zinc-400">{formatTime(message.created_at)}</div>
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })
}
