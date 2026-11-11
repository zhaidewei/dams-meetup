'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PROFILE_FIELDS, type MemberCard, type PersonalCommand } from '@/lib/meetup15/personal'
import { DiscussionComposer } from './DiscussionComposer'
import { GuestVipBadge } from './GuestVipBadge'
import { MemberAvatar } from './MemberAvatar'
import { useDiscussion } from './useDiscussion'

export function MemberBadge({ id, name, mine, timeline = false, vip = false }: { id: string; name: string; mine: boolean; timeline?: boolean; vip?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-2">
      <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700"
        aria-expanded={open} aria-label={`查看 ${name} 的资料${vip ? "（VIP 嘉宾）" : ""}`} onClick={() => setOpen(!open)}>
        <MemberAvatar id={id} name={name} className={timeline ? 'absolute top-0 left-0 size-9' : 'size-7'} />
        {name}
        {vip && <GuestVipBadge />}
      </button>
      {open && <MemberDetails id={id} mine={mine} />}
    </div>
  )
}

function MemberDetails({ id, mine }: { id: string; mine: boolean }) {
  const { data, pending, error, submit } = useDiscussion<MemberCard, PersonalCommand>(`/api/personal?member=${encodeURIComponent(id)}`, 'personal')
  const [sent, setSent] = useState(false)
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在读取资料…'}</p>
  const visibleFields = PROFILE_FIELDS.filter(({ key }) => data.publicProfile[key])
  return (
    <section className="space-y-2 rounded-md border border-zinc-200 p-3 text-sm" aria-label={`${data.name} 的资料`}>
      {visibleFields.length > 0 && <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
        {visibleFields.map(({ key, label }) => (
          <div key={key} className="contents">
            <dt className="text-slate-600">{label}</dt>
            <dd className="wrap-anywhere">{key === 'linkedin'
              ? <a className="text-dams-blue underline" href={data.publicProfile[key]} target="_blank" rel="noreferrer">{data.publicProfile[key]}</a>
              : data.publicProfile[key]}</dd>
          </div>
        ))}
      </dl>}
      {data.contact && <p className="whitespace-pre-wrap break-words">{data.contact}</p>}
      {!visibleFields.length && !data.contact && <p>暂无公开联系方式。</p>}
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
