'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { MemberCard, PersonalCommand } from '@/lib/meetup15/personal'
import { DiscussionComposer } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'

export function MemberBadge({ id, name, mine }: { id: string; name: string; mine: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-2">
      <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"
        aria-expanded={open} aria-label={`查看 ${name} 的资料`} onClick={() => setOpen(!open)}>
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-teal-100 text-teal-900">{Array.from(name)[0]}</span>
        {name}
      </button>
      {open && <MemberDetails id={id} mine={mine} />}
    </div>
  )
}

function MemberDetails({ id, mine }: { id: string; mine: boolean }) {
  const { data, pending, error, submit } = useDiscussion<MemberCard, PersonalCommand>(`/api/personal?member=${encodeURIComponent(id)}`, 'personal')
  const [sent, setSent] = useState(false)
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在读取资料…'}</p>
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm" aria-label={`${data.name} 的资料`}>
      <p className="whitespace-pre-wrap break-words">{data.contact || '暂无公开联系方式。'}</p>
      {error && <p role="alert">{error}</p>}
      {!mine && (data.named
        ? <DiscussionComposer label="私信正文" action="发送私信" pending={pending}
          onSubmit={async (body) => {
            const ok = await submit({ action: 'send', body })
            if (ok) setSent(true)
            return ok
          }} />
        : <p>先到<Link className="underline" href="/me">「我」填写昵称</Link>，即可发送私信。</p>)}
      {sent && <p role="status">私信已发送。<Link className="underline" href="/me?view=messages">查看会话</Link></p>}
    </section>
  )
}
