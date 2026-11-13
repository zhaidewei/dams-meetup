'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { MEETUP_SECTIONS } from '@/lib/meetup15/event'
import {
  MAX_NICKNAME_LENGTH, editableProfileFields, type PersonalCommand, type PersonalItem,
  type PersonalSnapshot, type ThreadSnapshot, type ThreadSummary,
} from '@/lib/meetup15/personal'
import { DiscussionComposer, discussionButton, discussionInput } from './DiscussionComposer'
import { ReplyList } from './DiscussionFeed'
import { MemberAvatar } from './MemberAvatar'
import { useDiscussion } from './useDiscussion'

const profileRow = 'grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]'
const views = { profile: '资料', posts: '我的帖子', messages: '私信', recovery: '恢复链接' } as const
type View = keyof typeof views

export function PersonalPanel({ initialView, recovery }: { initialView: View; recovery: ReactNode }) {
  const [view, setView] = useState(initialView)
  const { data, pending, error, submit } = useDiscussion<PersonalSnapshot, PersonalCommand>('/api/personal', 'personal')
  const lastRead = useRef(0)
  const replyThrough = data?.replies.find(reply => reply.unread)?.id ?? 0

  useEffect(() => {
    if (view === 'posts' && replyThrough > lastRead.current) {
      lastRead.current = replyThrough
      void submit({ action: 'replies-read', through: replyThrough })
    }
  }, [replyThrough, submit, view])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await submit({ action: 'profile', name: String(form.get('name') ?? ''),
      publicProfile: Object.fromEntries(editableProfileFields(Boolean(data?.guest)).map(({ key }) => [key, String(form.get(key) ?? '')])),
      removeLegacyContact: form.has('removeLegacyContact'),
      revision: Number(form.get('revision')) })
  }

  const unreadMessages = data?.threads.some(item => item.unread)
  return (
    <div className="space-y-4">
      <nav className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2" aria-label="个人页">
        {(Object.keys(views) as View[]).map((item) => (
          <button key={item} type="button" className="relative min-h-11 rounded-full border border-dams-line px-1 text-sm focus-visible:outline-2 focus-visible:outline-dams-blue aria-pressed:border-dams-selection aria-pressed:bg-dams-selection aria-pressed:font-semibold aria-pressed:text-dams-hover sm:px-4" aria-pressed={view === item}
            onClick={() => setView(item)}>
            {views[item]}
            {((item === 'posts' && replyThrough > 0) || (item === 'messages' && unreadMessages)) && (
              <><span aria-hidden className="absolute top-1.5 right-2 size-1.5 rounded-full bg-dams-blue" /><span className="sr-only"> · 有未读</span></>
            )}
          </button>
        ))}
      </nav>
      {view !== 'recovery' && error && <p role="alert" className="text-red-700">{error}</p>}
      {view !== 'recovery' && !data && !error && <p role="status">正在读取个人页…</p>}
      {data && view === 'profile' && (
        <form key={data.profileRevision} onSubmit={saveProfile} className="max-w-lg space-y-3 rounded-2xl border border-dams-line bg-white p-4">
          <input type="hidden" name="revision" value={data.profileRevision} />
          <label className={profileRow}>昵称
            <input name="name" defaultValue={data.nickname ?? ''} maxLength={Math.max(MAX_NICKNAME_LENGTH, data.nickname?.length ?? 0)}
              required className={discussionInput} />
          </label>
          <fieldset className="min-w-0 space-y-3 border-t border-dams-line pt-3" aria-describedby="profile-public">
            <legend className="sr-only">可选公开资料</legend>
            <p id="profile-public" className="text-sm text-slate-600">以下资料选填。填写并保存后，已入场的观众可在你的资料卡上查看。</p>
            {editableProfileFields(data.guest).map(({ key, label, type, maxLength, autoComplete }) => (
              <label key={key} className={profileRow}>{label}
                <input name={key} type={type} autoComplete={autoComplete} maxLength={maxLength}
                  defaultValue={data.publicProfile[key] ?? ''} className={discussionInput} />
              </label>
            ))}
          </fieldset>
          {data.contact && (
            <div className="space-y-2 rounded-lg bg-dams-canvas p-3 text-sm">
              <p>旧联系方式 · {data.contactPublic ? '已向入场观众公开' : '仅自己可见'}</p>
              <p className="wrap-anywhere whitespace-pre-wrap">{data.contact}</p>
              <label><input type="checkbox" name="removeLegacyContact" /> 保存时移除旧联系方式</label>
            </div>
          )}
          <button className="min-h-11 rounded-full bg-dams-blue px-5 text-sm font-semibold text-white hover:bg-dams-hover disabled:opacity-50"
            disabled={pending}>保存资料</button>
        </form>
      )}
      {data && view === 'posts' && <PersonalPosts items={data.posts} feedRead={data.replies[0]?.id ?? 0} />}
      {data && view === 'messages' && <MessageList threads={data.threads} />}
      {view === 'recovery' && recovery}
    </div>
  )
}

function PersonalPosts({ items, feedRead }: { items: PersonalItem[]; feedRead: number }) {
  if (!items.length) return <p>你还没有发帖。</p>
  return <ul className="space-y-2">
    {items.map(item => (
      <li className="space-y-1 rounded-xl border border-dams-line bg-white p-3" key={item.id}>
        <p className="wrap-anywhere text-xs text-zinc-600">{MEETUP_SECTIONS[item.section]}</p>
        <p className="whitespace-pre-wrap wrap-anywhere">{item.body}</p>
        <PersonalPostReplies postId={item.id} feedRead={feedRead} />
      </li>
    ))}
  </ul>
}

function PersonalPostReplies({ postId, feedRead, parentId }: { postId: number; feedRead: number; parentId?: number }) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 w-fit cursor-pointer rounded py-3 text-sm font-medium text-dams-hover focus-visible:outline-2 focus-visible:outline-dams-blue">
        {parentId === undefined ? '查看回复' : '查看子回复'}
      </summary>
      {open && <ReplyList postId={postId} parentId={parentId} feedRead={feedRead} render={reply => (
        <>
          <p className="text-xs font-semibold text-slate-600">{reply.author}</p>
          <p className="text-sm whitespace-pre-wrap wrap-anywhere">{reply.body}</p>
          {Boolean(reply.replyCount) && <PersonalPostReplies postId={postId} parentId={reply.id} feedRead={feedRead} />}
        </>
      )} />}
    </details>
  )
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
