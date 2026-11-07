'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MEETUP_SECTIONS } from '@/lib/meetup15/event'
import {
  MAX_CONTACT_LENGTH, MAX_NICKNAME_LENGTH, type PersonalCommand, type PersonalItem,
  type PersonalSnapshot, type ThreadSnapshot, type ThreadSummary,
} from '@/lib/meetup15/personal'
import { DiscussionComposer, discussionButton, discussionInput } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'

type View = 'profile' | 'posts' | 'replies' | 'messages'
const views = { profile: '资料', posts: '我的帖子', replies: '收到的回复', messages: '私信' } as const

export function PersonalPanel({ initialMessages }: { initialMessages: boolean }) {
  const [view, setView] = useState<View>(initialMessages ? 'messages' : 'profile')
  const [thread, setThread] = useState<number | null>(null)
  const { data, pending, error, submit } = useDiscussion<PersonalSnapshot, PersonalCommand>('/api/personal', 'personal')
  const lastRead = useRef(0)
  const replyThrough = data?.replies.find(reply => reply.unread)?.id ?? 0

  useEffect(() => {
    if (view === 'replies' && replyThrough > lastRead.current) {
      lastRead.current = replyThrough
      void submit({ action: 'replies-read', through: replyThrough })
    }
  }, [replyThrough, submit, view])

  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在读取个人页…'}</p>

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await submit({ action: 'profile', name: String(form.get('name') ?? ''),
      contact: String(form.get('contact') ?? ''), contactPublic: form.has('public'),
      revision: Number(form.get('revision')) })
  }

  const unreadReplies = data.replies.some(reply => reply.unread)
  const unreadMessages = data.threads.some(item => item.unread)
  const selected = data.threads.find(item => item.id === thread)
  if (thread !== null && !selected) setThread(null)
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="个人页">
        {(Object.keys(views) as View[]).map((item) => (
          <button key={item} type="button" className={discussionButton} aria-pressed={view === item}
            onClick={() => { setView(item); setThread(null) }}>
            {views[item]}{((item === 'replies' && unreadReplies) || (item === 'messages' && unreadMessages)) && ' · 有未读'}
          </button>
        ))}
      </nav>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {view === 'profile' && (
        <form key={data.profileRevision} onSubmit={saveProfile} className="max-w-lg space-y-3">
          <input type="hidden" name="revision" value={data.profileRevision} />
          <label className="block">昵称
            <input name="name" defaultValue={data.nickname ?? ''} maxLength={Math.max(MAX_NICKNAME_LENGTH, data.nickname?.length ?? 0)}
              required className={discussionInput} />
          </label>
          <label className="block">联系方式
            <textarea name="contact" defaultValue={data.contact ?? ''} maxLength={MAX_CONTACT_LENGTH} className={discussionInput} />
          </label>
          <label className="block text-sm"><input type="checkbox" name="public" defaultChecked={data.contactPublic} /> 向已入场观众公开联系方式</label>
          <button className={discussionButton} disabled={pending}>保存资料</button>
        </form>
      )}
      {view === 'posts' && <PersonalItems items={data.posts} empty="你还没有发帖。" />}
      {view === 'replies' && <PersonalItems items={data.replies} empty="你还没有收到回复。" />}
      {view === 'messages' && (selected
        ? <Thread key={selected.id} summary={selected} onBack={() => setThread(null)} />
        : <ul className="space-y-2">
          {!data.threads.length && <li>你还没有私信。可以点讨论区里的头像发私信。</li>}
          {data.threads.map(item => (
            <li key={item.id}>
              <button className={`${discussionButton} w-full text-left`} onClick={() => setThread(item.id)}>
                <span className="block font-semibold">
                  {Boolean(item.system) && <OfficialBadge />}
                  {item.name}{Boolean(item.unread) && ' · 有未读'}
                </span>
                <span className="block truncate text-sm text-zinc-600">{item.body}</span>
              </button>
            </li>
          ))}
        </ul>)}
    </div>
  )
}

function PersonalItems({ items, empty }: { items: PersonalItem[]; empty: string }) {
  if (!items.length) return <p>{empty}</p>
  return <ul className="space-y-2">
    {items.map(item => (
      <li className="space-y-1 rounded border border-zinc-200 p-3" key={item.id}>
        <p className="text-xs text-zinc-600">{item.author && `${item.author} · `}{MEETUP_SECTIONS[item.section]}</p>
        <p className="whitespace-pre-wrap break-words">{item.body}</p>
      </li>
    ))}
  </ul>
}

function Thread({ summary, onBack }: { summary: ThreadSummary; onBack: () => void }) {
  const [pages, setPages] = useState<number[]>([])
  const lastRead = useRef(0)
  const lastShown = useRef(0)
  const before = pages.at(-1)
  const { data, pending, error, submit } = useDiscussion<ThreadSnapshot, PersonalCommand>(
    `/api/personal?thread=${summary.id}${before ? `&before=${before}` : ''}`, 'personal')
  const through = data?.messages.findLast(message => message.unread)?.id ?? 0
  const shownThrough = data?.messages.at(-1)?.id ?? 0
  useEffect(() => {
    lastShown.current = Math.max(lastShown.current, shownThrough)
    if (!before && through > lastRead.current) {
      lastRead.current = through
      void submit({ action: 'thread-read', through })
    }
  }, [before, shownThrough, submit, through])
  return (
    <section className="space-y-3" aria-label="私信会话">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={discussionButton} onClick={onBack}>返回私信列表</button>
        <button type="button" className={discussionButton} disabled={!data || !shownThrough || pending}
          onClick={async () => {
            if (await submit({ action: 'thread-delete', through: Math.max(lastShown.current, shownThrough) })) onBack()
          }}>删除会话</button>
      </div>
      <h2 className="text-lg font-semibold">{Boolean(summary.system) && <OfficialBadge />}{summary.name}</h2>
      {error && <p role="alert">{error}</p>}
      {data && <>
        <ul className="space-y-2">
          {data.messages.map(message => (
            <li className="rounded border border-zinc-200 p-3" key={message.id}>
              <p className="text-xs font-semibold">{data.system && <OfficialBadge />}{message.mine ? '我' : data.name}</p>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          {data.nextBefore && <button className={discussionButton} onClick={() => setPages([...pages, data.nextBefore!])}>更早的消息</button>}
          {before && <button className={discussionButton} onClick={() => setPages(pages.slice(0, -1))}>返回较新的消息</button>}
        </div>
        {!before && !data.system && (data.named
          ? <DiscussionComposer label="私信正文" action="发送私信" pending={pending} onSubmit={(body) => submit({ action: 'send', body })} />
          : <p>先到<Link className="underline" href="/me">「我」填写昵称</Link>，即可发送私信。</p>)}
      </>}
    </section>
  )
}

function OfficialBadge() {
  return <span className="mr-1 rounded bg-teal-100 px-1.5 py-0.5 text-xs font-medium text-teal-900">官方</span>
}
