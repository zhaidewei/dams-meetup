'use client'

import Link from 'next/link'
import { Heart, MessageCircle } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { MAX_QUESTION_BODY, type DiscussionItem, type FeedSnapshot, type MemberCommand, type ReplyPage } from '@/lib/meetup15/discussion'
import { MEETUP_SECTIONS, type MeetupSection } from '@/lib/meetup15/event'
import { MemberBadge } from './MemberBadge'
import { DiscussionComposer, discussionButton, discussionInput } from './DiscussionComposer'
import { DiscussionReactions } from './DiscussionReactions'
import { useDiscussion } from './useDiscussion'

const feedButton = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-slate-600 hover:bg-dams-wash aria-pressed:bg-dams-selection aria-pressed:text-dams-hover disabled:opacity-50'
const tabButton = 'min-h-12 shrink-0 border-b-2 border-transparent px-3 text-sm font-medium text-slate-600 hover:bg-dams-wash aria-pressed:border-dams-blue aria-pressed:font-semibold aria-pressed:text-dams-hover'

type Submit = (command: MemberCommand) => Promise<boolean>

function PostCard({ post, snapshot, named, pending, submit }: {
  post: DiscussionItem
  snapshot: FeedSnapshot
  named: boolean
  pending: boolean
  submit: Submit
}) {
  const [editor, setEditor] = useState<{ kind: 'edit' | 'reply'; id: number } | null>(null)
  const [threadOpen, setThreadOpen] = useState(false)
  const [children, setChildren] = useState<Set<number>>(() => new Set())
  const cancel = () => setEditor(null)
  const send = async (command: MemberCommand) => {
    const ok = await submit(command)
    if (ok) {
      if (command.action === 'reply') {
        setThreadOpen(true)
        const parent = command.parentId
        if (parent !== null) setChildren(previous => new Set(previous).add(parent))
      }
      cancel()
    }
    return ok
  }

  function renderEntry(item: DiscussionItem) {
    const isPost = item.kind === 'post'
    const canReply = named && item.parentId === null
    const expanded = isPost ? threadOpen : children.has(item.id)
    return (
      <div className="relative min-h-10 space-y-1.5 pl-11">
        <MemberBadge id={item.authorId} name={item.author} mine={item.mine} vip={item.authorRole === 'guest'} timeline />
        {editor?.kind === 'edit' && editor.id === item.id ? (
          <DiscussionComposer label={isPost ? '编辑帖子正文' : '编辑回复正文'} action="保存修改"
            pending={pending} initialBody={item.body} initialTags={isPost ? item.tags : undefined} onCancel={cancel}
            onSubmit={(body, tags) => send({ action: 'edit', id: item.id, body, tags })} />
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap break-words">{item.body}</p>
        )}
        {isPost && item.tags.length > 0 && (
          <ul aria-label="帖子标签" className="flex flex-wrap gap-2 text-xs text-dams-blue">
            {item.tags.map((tag) => <li key={tag}>#{tag}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          {Boolean(item.replyCount) && (
            <button type="button" className={feedButton} aria-expanded={expanded}
              onClick={() => {
                if (isPost) setThreadOpen(!threadOpen)
                else setChildren(previous => {
                  const next = new Set(previous)
                  if (expanded) next.delete(item.id)
                  else next.add(item.id)
                  return next
                })
                cancel()
              }}>
              <MessageCircle size={17} aria-hidden />{item.replyCount} 条{isPost ? '回复' : '子回复'}
            </button>
          )}
          {isPost && (
            <button className={feedButton} aria-pressed={item.liked} disabled={pending}
              onClick={() => void submit({ action: 'like', id: item.id, liked: !item.liked })}>
              <Heart size={17} aria-hidden fill={item.liked ? 'currentColor' : 'none'} />点赞 {item.likes}
            </button>
          )}
          {canReply && (
            <button className={feedButton} disabled={pending} onClick={() => setEditor({ kind: 'reply', id: item.id })}>
              {isPost ? '回复帖子' : '回复这条'}
            </button>
          )}
          {item.mine && (
            <>
              <button className={feedButton} disabled={pending} onClick={() => setEditor({ kind: 'edit', id: item.id })}>
                {isPost ? '编辑帖子' : '编辑回复'}
              </button>
              <button className={discussionButton} disabled={pending} onClick={() => {
                if (window.confirm(isPost ? '删除这条帖子及其回复？' : '删除这条回复及其子回复？')) {
                  void send({ action: 'delete', id: item.id })
                }
              }}>{isPost ? '删除帖子' : '删除回复'}</button>
            </>
          )}
        </div>
        <DiscussionReactions item={item} pending={pending} submit={submit} />
        {editor?.kind === 'reply' && editor.id === item.id && (
          <DiscussionComposer label={isPost ? '回复正文' : '子回复正文'} action="发表回复" pending={pending}
            onCancel={cancel} onSubmit={(body) => send({
              action: 'reply', postId: post.id, parentId: isPost ? null : item.id, body,
            })} />
        )}
      </div>
    )
  }

  return (
    <article className="space-y-3 border-b border-dams-line bg-white px-4 py-4 sm:px-6">
      {renderEntry(post)}
      {threadOpen && (
        <ReplyList postId={post.id} snapshot={snapshot} render={reply => (
          <>
            {renderEntry(reply)}
            {children.has(reply.id) && <ReplyList postId={post.id} parentId={reply.id} snapshot={snapshot} render={renderEntry} />}
          </>
        )} />
      )}
    </article>
  )
}

function ReplyList({ postId, parentId, snapshot, render }: {
  postId: number
  parentId?: number
  snapshot: FeedSnapshot
  render: (reply: DiscussionItem) => ReactNode
}) {
  const [cursors, setCursors] = useState([0])
  const [retry, setRetry] = useState(0)
  const [pages, setPages] = useState<ReplyPage[]>([])
  const [error, setError] = useState(false)
  const loading = pages.length < cursors.length

  useEffect(() => {
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(7000)])
    void Promise.all(cursors.map(async after => {
      const params = new URLSearchParams({ post: String(postId), after: String(after) })
      if (parentId !== undefined) params.set('parent', String(parentId))
      const response = await fetch('/api/discussion/replies?' + params, { cache: 'no-store', signal })
      if (!response.ok) throw new Error('Reply page read failed')
      return await response.json() as ReplyPage
    })).then(data => {
      if (!controller.signal.aborted) {
        setPages(data)
        setError(false)
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => controller.abort()
  }, [postId, parentId, cursors, snapshot, retry])

  const next = pages.at(-1)?.nextAfter
  const replies = new Map(pages.flatMap(page => page.items.map(reply => [reply.id, reply] as const)))
  return (
    <div className="ml-3 space-y-3 border-l-2 border-dams-line pl-3">
      {[...replies.values()].map(reply => <div key={reply.id} className="space-y-2">{render(reply)}</div>)}
      {error ? <p role="alert" className="text-sm text-red-700">
        回复加载失败。<button className={feedButton} onClick={() => setRetry(value => value + 1)}>重试</button>
      </p> : loading ? <p role="status" className="text-sm text-slate-600">正在加载回复…</p> : null}
      {!loading && !replies.size && <p className="text-sm text-slate-600">暂无回复。</p>}
      {next && !loading && !error && <button className={feedButton}
        onClick={() => setCursors(previous => [...previous, next])}>加载更多回复</button>}
    </div>
  )
}

export function DiscussionFeed() {
  const [selected, setSelected] = useState<MeetupSection | null>(null)
  const [round, setRound] = useState<number | null>(null)
  const [pageStack, setPageStack] = useState<number[]>([])
  const before = pageStack.at(-1)
  const params = new URLSearchParams()
  if (selected) params.set('section', selected)
  if (round) params.set('round', String(round))
  if (before) params.set('before', String(before))
  const { data, error, pending, submit, retry, unauthorized } = useDiscussion<FeedSnapshot>(`/api/discussion?${params}`)
  const named = Boolean(data?.nickname)

  function choose(section: MeetupSection | null) {
    setSelected(section)
    setRound(null)
    setPageStack([])
  }

  async function setNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('nickname') ?? '')
    await submit({ action: 'nickname', name })
  }

  const active = data?.activeRound
  const navigation = (
    <nav key="discussion-sections" aria-label="讨论板块" className="flex overflow-x-auto border-b border-dams-line px-2">
      <button className={tabButton} aria-pressed={selected === null}
        onClick={() => choose(null)}>跟随现场</button>
      {Object.entries(MEETUP_SECTIONS).map(([key, label]) => (
        <button key={key} className={tabButton} aria-pressed={selected === key}
          onClick={() => choose(key as MeetupSection)}>
          {label}
          {active?.section === key && (
            <span className="ml-2 rounded-full bg-dams-wash px-2 py-0.5 text-xs font-semibold text-dams-hover">问答中</span>
          )}
        </button>
      ))}
    </nav>
  )
  const feedback = error && (
    <div className="flex flex-wrap items-center gap-2">
      <p role="alert" className="text-sm text-red-700">{error}</p>
      {unauthorized
        ? <Link href="/" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-dams-hover underline">重新入场</Link>
        : <button type="button" className={discussionButton} onClick={() => void retry()}>重试</button>}
    </div>
  )
  if (!data) return (
    <div>
      {navigation}
      <div className="px-4 py-5 sm:px-6">
        {feedback || <p role="status">正在加载讨论区…</p>}
      </div>
    </div>
  )

  const viewed = data.viewedRound
  const liveRound = viewed !== null && viewed.id === active?.id
  const qaSection = active ? MEETUP_SECTIONS[active.section] : null
  const posts = data.items.filter((entry) => entry.kind === 'post')
  return (
    <div>
      {active && !liveRound && (
        <aside aria-label="进行中的问答" className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dams-selection bg-dams-wash px-4 py-3 sm:mx-6">
          <div>
            <p className="text-sm font-semibold text-dams-hover">问答进行中 · {active.guest}</p>
            <p className="text-sm text-slate-700">{qaSection}</p>
          </div>
          <button className="min-h-11 rounded-full bg-dams-blue px-4 text-sm font-semibold text-white hover:bg-dams-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dams-blue"
            onClick={() => choose(active.section)}>前往提问</button>
        </aside>
      )}
      {navigation}
      <div className="space-y-4 border-b border-dams-line px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{MEETUP_SECTIONS[data.section]}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className="rounded-full bg-dams-wash px-3 py-1 text-xs text-dams-hover">现场 · {MEETUP_SECTIONS[data.currentSection]}</p>
            <a href="#feed-compose" className="inline-flex min-h-11 items-center rounded-full border border-dams-selection bg-white px-3 text-sm font-semibold text-dams-hover hover:bg-dams-wash">发帖</a>
          </div>
        </div>
        {feedback}
        {!named && (
          <form id="feed-compose" className="scroll-mt-4 space-y-2 rounded-xl border border-dams-line p-3" onSubmit={setNickname}>
            <label className="block text-sm">填写昵称后可以发帖、回复和提问
              <input name="nickname" className={discussionInput} maxLength={48} required />
            </label>
            <button className={discussionButton} disabled={pending}>保存昵称</button>
          </form>
        )}
        {data.rounds.some((entry) => entry.section === data.section) && (
          <section aria-label="问答" className="space-y-3 rounded-xl border border-dams-selection bg-dams-wash p-4">
            <h3 className="font-semibold">嘉宾问答</h3>
            {liveRound && viewed && (
              <div className="space-y-3 rounded-xl border-2 border-dams-blue bg-white p-4">
                <p className="font-semibold text-dams-hover">问答进行中 · {viewed.guest}</p>
                {named ? (
                  <DiscussionComposer key={viewed.id} label="你的问题" action="提交问题" pending={pending}
                    featured maxLength={MAX_QUESTION_BODY} placeholder="你想问这位嘉宾什么？"
                    onSubmit={(body) => submit({ action: 'question', section: data.section, roundId: viewed.id, body })} />
                ) : <p className="text-sm text-slate-700">填写上方昵称后即可提问。</p>}
              </div>
            )}
            <label htmlFor="discussion-round" className="block text-sm">查看本板块问答轮次</label>
              <select id="discussion-round" className={discussionInput} value={round ?? ''}
                onChange={(event) => {
                  if (event.target.value) setSelected(data.section)
                  setRound(event.target.value ? Number(event.target.value) : null)
                }}>
                <option value="">当前问答</option>
                {data.rounds.filter((entry) => entry.section === data.section && entry.closedAt !== null)
                  .map((entry) => <option key={entry.id} value={entry.id}>第 {entry.id} 轮 · {entry.guest}</option>)}
              </select>
            {viewed ? (
              <>
                {!liveRound && <p className="font-medium">第 {viewed.id} 轮 · {viewed.guest} · 已结束</p>}
                {data.questions.length ? (
                  <ol className="space-y-2">
                    {data.questions.map((question) => (
                      <li key={question.id} className="rounded border border-dams-line bg-white p-3">
                        <p className="whitespace-pre-wrap break-words">{question.body}</p>
                        <MemberBadge id={question.authorId} name={question.author} mine={question.mine} />
                        <p className="text-xs text-zinc-600">{question.answered ? '已答' : '未答'}</p>
                        {liveRound ? (
                          <button className={discussionButton} aria-pressed={question.liked} disabled={pending}
                            onClick={() => void submit({ action: 'like', id: question.id, liked: !question.liked })}>
                            问题点赞 {question.likes}
                          </button>
                        ) : <p className="text-sm">点赞 {question.likes}</p>}
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm">本轮还没有问题。</p>}
              </>
            ) : <p className="text-sm">本板块当前没有进行中的问答。</p>}
          </section>
        )}
        {named && (
          <div id="feed-compose" className="scroll-mt-4 rounded-xl border border-slate-300 bg-white p-4">
            <DiscussionComposer label={`发布到${MEETUP_SECTIONS[data.section]}`} action="发布帖子" pending={pending} initialTags={[]}
              featured placeholder="分享你的想法或现场见闻…"
              onSubmit={(body, tags) => submit({ action: 'post', section: data.section, body, tags })} />
          </div>
        )}
      </div>
      {posts.length ? posts.map((post) => (
        <PostCard key={post.id} post={post} named={named} pending={pending} submit={submit}
          snapshot={data} />
      )) : <p className="px-4 py-6 text-sm text-slate-600 sm:px-6">暂无讨论。</p>}
      <div className="flex gap-2 px-4 py-3 sm:px-6">
        {before && <button className={discussionButton} onClick={() => setPageStack((stack) => stack.slice(0, -1))}>
          较新的帖子
        </button>}
        {data.nextBefore && <button className={discussionButton} onClick={() => {
          const cursor = data.nextBefore
          if (cursor) {
            setSelected(data.section)
            setPageStack((stack) => [...stack, cursor])
          }
        }}>较早的帖子</button>}
      </div>
    </div>
  )
}
