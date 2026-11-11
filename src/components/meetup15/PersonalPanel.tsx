'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MEETUP_SECTIONS } from '@/lib/meetup15/event'
import {
  MAX_CONTACT_LENGTH, MAX_NICKNAME_LENGTH, type PersonalCommand, type PersonalItem,
  type PersonalSnapshot, type ThreadSnapshot, type ThreadSummary,
} from '@/lib/meetup15/personal'
import { DiscussionComposer, discussionButton, discussionInput } from './DiscussionComposer'
import { MemberAvatar } from './MemberAvatar'
import { useDiscussion } from './useDiscussion'

type View = 'profile' | 'posts' | 'replies' | 'messages'
const views = { profile: '资料', posts: '我的帖子', replies: '收到的回复', messages: '私信' } as const

export function PersonalPanel({ initialMessages }: { initialMessages: boolean }) {
  const [view, setView] = useState<View>(initialMessages ? 'messages' : 'profile')
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
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="个人页">
        {(Object.keys(views) as View[]).map((item) => (
          <button key={item} type="button" className={discussionButton + ' min-h-11 rounded-full aria-pressed:border-dams-selection aria-pressed:bg-dams-selection aria-pressed:font-semibold aria-pressed:text-dams-hover'} aria-pressed={view === item}
            onClick={() => setView(item)}>
            {views[item]}{((item === 'replies' && unreadReplies) || (item === 'messages' && unreadMessages)) && ' · 有未读'}
          </button>
        ))}
      </nav>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {view === 'profile' && (
        <form key={data.profileRevision} onSubmit={saveProfile} className="max-w-lg space-y-3 rounded-2xl border border-dams-line bg-white p-4">
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
      {view === 'messages' && <MessageList threads={data.threads} />}
    </div>
  )
}

function PersonalItems({ items, empty }: { items: PersonalItem[]; empty: string }) {
  if (!items.length) return <p>{empty}</p>
  return <ul className="space-y-2">
    {items.map(item => (
      <li className="space-y-1 rounded border border-dams-line p-3" key={item.id}>
        <p className="text-xs text-zinc-600">{item.author && `${item.author} · `}{MEETUP_SECTIONS[item.section]}</p>
        <p className="whitespace-pre-wrap break-words">{item.body}</p>
      </li>
    ))}
  </ul>
}

function contactKey(thread: ThreadSummary) {
  return thread.contactId ?? 'system'
}

function MessageList({ threads }: { threads: ThreadSummary[] }) {
  const [openContact, setOpenContact] = useState<string | null>(null)
  if (openContact !== null && !threads.some(thread => contactKey(thread) === openContact)) setOpenContact(null)

  if (!threads.length) return <p>你还没有私信。可以点讨论区里的头像发私信。</p>
  return (
    <ul aria-label="私信联系人" className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-dams-line bg-white">
      {threads.map(thread => {
        const key = contactKey(thread)
        const open = openContact === key
        const panelId = `dm-contact-${thread.id}`
        return (
          <li key={key}>
            <button type="button" aria-expanded={open} aria-controls={panelId}
              className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dams-blue sm:px-4"
              onClick={() => setOpenContact(open ? null : key)}>
              <MemberAvatar id={thread.contactId} name={thread.system ? '官方' : thread.name} className="size-9 text-sm" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  {Boolean(thread.system) && <OfficialBadge />}
                  <span className="truncate">{thread.name}</span>
                  {Boolean(thread.unread) && <span className="shrink-0 rounded-full bg-dams-wash px-2 py-0.5 text-xs text-dams-blue">未读</span>}
                </span>
                {!open && <span className="mt-0.5 block truncate text-sm text-zinc-600">{thread.body}</span>}
              </span>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`size-5 shrink-0 text-zinc-500 ${open ? 'rotate-180' : ''}`}>
                <path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div id={panelId} hidden={!open}>
              {open && <Thread summary={thread} onDelete={() => setOpenContact(current => current === key ? null : current)} />}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Thread({ summary, onDelete }: { summary: ThreadSummary; onDelete: () => void }) {
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
    <section className="space-y-3 border-t border-zinc-100 bg-zinc-50 px-3 py-3 sm:px-4" aria-label={`与 ${summary.name} 的私信`}>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status" className="text-sm text-zinc-600">正在读取私信…</p>}
      {data && <>
        <ul className="space-y-2">
          {data.messages.map(message => (
            <li className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`} key={message.id}>
              <div className={`min-w-0 max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.mine ? 'bg-dams-selection text-dams-ink' : 'border border-dams-line bg-white'}`}>
                <span className="sr-only">{message.mine ? '我' : data.name}</span>
                <p className="whitespace-pre-wrap wrap-anywhere">{message.body}</p>
              </div>
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
        <div className="flex justify-end">
          <button type="button" className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-200 disabled:opacity-50"
            disabled={!shownThrough || pending} onClick={async () => {
              if (await submit({ action: 'thread-delete', through: Math.max(lastShown.current, shownThrough) })) onDelete()
            }}>删除会话</button>
        </div>
      </>}
    </section>
  )
}

function OfficialBadge() {
  return <span className="mr-1 rounded bg-dams-selection px-1.5 py-0.5 text-xs font-medium text-dams-hover">官方</span>
}
