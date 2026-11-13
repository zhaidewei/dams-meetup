'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { compareQuestions, mergeQuestions, questionRoundTitle, FEED_VERSIONS_HEADER, MAX_QUESTION_BODY, type DiscussionItem, type FeedSnapshot, type FeedUpdate, type FeedVersions, type MemberCommand, type QaWriteAck, type ReplyPage } from '@/lib/meetup15/discussion'
import { isBreakoutGroup, isMeetupSection, MEETUP_DISCUSSION_AGENDA, MEETUP_BREAKOUT_GROUPS, MEETUP_SECTIONS, meetupDiscussionPath, type MeetupSection } from '@/lib/meetup15/event'
import { MemberBadge } from './MemberBadge'
import { DiscussionComposer, discussionButton, discussionInput } from './DiscussionComposer'
import { DiscussionReactions } from './DiscussionReactions'
import { useDiscussion, type DiscussionTransport } from './useDiscussion'

const feedButton = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-slate-600 hover:bg-dams-wash aria-pressed:bg-dams-selection aria-pressed:text-dams-hover disabled:opacity-50'
const qaLike = 'inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm tabular-nums text-slate-600'
const qaStatus = 'inline-block whitespace-nowrap rounded-full bg-dams-orange px-2 py-0.5 text-xs font-bold text-dams-ink'
const qaAction = 'inline-flex min-h-11 items-center rounded-full bg-dams-orange px-4 text-sm font-bold text-dams-ink hover:bg-dams-orange-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dams-blue'

type Submit = (command: MemberCommand) => Promise<boolean>

function PostCard({ post, snapshot, named, pending, submit }: {
  post: DiscussionItem
  snapshot: FeedView
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
    const replyLabel = isPost ? '回复' : '子回复'
    const canReply = named && item.parentId === null
    const expanded = isPost ? threadOpen : children.has(item.id)
    return (
      <div className="relative min-h-11 min-w-0 space-y-1.5 pl-10 sm:pl-11">
        <MemberBadge id={item.authorId} name={item.author} mine={item.mine} vip={item.authorRole === 'guest'} timeline />
        {editor?.kind === 'edit' && editor.id === item.id ? (
          <DiscussionComposer label={isPost ? '编辑帖子正文' : '编辑回复正文'} action="保存修改"
            pending={pending} initialBody={item.body} initialTags={isPost ? item.tags : undefined} onCancel={cancel}
            onSubmit={(body, tags) => send({ action: 'edit', id: item.id, body, tags })} />
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap wrap-anywhere">{item.body}</p>
        )}
        {isPost && item.tags.length > 0 && (
          <ul aria-label="帖子标签" className="flex flex-wrap gap-2 text-xs text-dams-blue">
            {item.tags.map((tag) => <li key={tag} className="min-w-0 wrap-anywhere">#{tag}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          <DiscussionReactions item={item} pending={pending} submit={submit}>
            {isPost && (
              <button className={feedButton} aria-pressed={item.liked} disabled={pending}
                onClick={() => void submit({ action: 'like', id: item.id, liked: !item.liked })}>
                <span aria-hidden="true" className="text-base">♥️</span>点赞 {item.likes}
              </button>
            )}
          </DiscussionReactions>
          {Boolean(item.replyCount) && (
            <button type="button" className={`${feedButton} whitespace-nowrap bg-dams-wash font-semibold text-dams-hover hover:bg-dams-selection aria-expanded:bg-dams-selection focus-visible:outline-2 focus-visible:outline-dams-blue`} aria-expanded={expanded}
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
              <ChevronDown size={16} aria-hidden className={expanded ? 'rotate-180' : undefined} />
              {expanded ? `收起${replyLabel}` : `展开 ${item.replyCount} 条${replyLabel}`}
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
        <ReplyList postId={post.id} feedRead={snapshot.feedRead} render={reply => (
          <>
            {renderEntry(reply)}
            {children.has(reply.id) && <ReplyList postId={post.id} parentId={reply.id} feedRead={snapshot.feedRead} render={renderEntry} />}
          </>
        )} />
      )}
    </article>
  )
}

export function ReplyList({ postId, parentId, feedRead, render }: {
  postId: number
  parentId?: number
  feedRead: number
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
  }, [postId, parentId, cursors, feedRead, retry])

  const next = pages.at(-1)?.nextAfter
  const replies = new Map(pages.flatMap(page => page.items.map(reply => [reply.id, reply] as const)))
  return (
    <div className="ml-1 min-w-0 space-y-3 border-l-2 border-dams-line pl-2 sm:ml-3 sm:pl-3">
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

type FeedView = FeedSnapshot & {
  feedRead: number
  versions?: FeedVersions
  confirmedBase?: DiscussionItem[]
  confirmedWrites?: QaWriteAck[]
}

function displayQuestions(view: FeedView, base: DiscussionItem[], writes: QaWriteAck[]): FeedView {
  const pending = writes.filter(write => view.qaRevision !== undefined && write.revision > view.qaRevision)
  if (!pending.length) return { ...view, confirmedBase: undefined, confirmedWrites: undefined, questions: base }
  const items = new Map(base.map(question => [question.id, question]))
  for (const write of pending) {
    if ('question' in write) {
      if (!items.has(write.question.id)) items.set(write.question.id, write.question)
    } else {
      const question = items.get(write.like.id)
      if (question) items.set(question.id, { ...question, liked: write.like.liked })
    }
  }
  return { ...view, confirmedBase: base, confirmedWrites: pending, questions: [...items.values()].sort(compareQuestions) }
}

const feedTransport: DiscussionTransport<FeedView> = {
  skipPollingWhenConnected: true,
  headers(snapshot) {
    const versions = snapshot?.versions
    return { [FEED_VERSIONS_HEADER]: versions ? `${versions.questions},${versions.posts}` : ',' }
  },
  async read(response, snapshot) {
    const { questionDelta, ...data } = await response.json<FeedUpdate>()
    const items = data.items ?? snapshot?.items
    let questions = data.questions ?? snapshot?.confirmedBase ?? snapshot?.questions
    if (questionDelta && questions) questions = mergeQuestions(questions, questionDelta)
    if (!items || !questions) throw new Error('Missing discussion snapshot')
    const view = { ...data, items, questions, feedRead: (snapshot?.feedRead ?? 0) + 1,
      nextBefore: data.items ? data.nextBefore ?? null : snapshot?.nextBefore ?? null }
    const writes = snapshot?.viewedRound?.id === view.viewedRound?.id ? snapshot?.confirmedWrites ?? [] : []
    return displayQuestions(view, questions, writes)
  },
  async applyWrite(response, snapshot) {
    if (response.status !== 200 || snapshot.qaRevision === undefined) return null
    const ack = await response.json<QaWriteAck>()
    if (!Number.isSafeInteger(ack.revision) || snapshot.viewedRound?.id !== ack.roundId ||
        snapshot.viewedRound.closedAt !== null) return null
    if (ack.revision <= snapshot.qaRevision) return snapshot
    return displayQuestions(snapshot, snapshot.confirmedBase ?? snapshot.questions, [...(snapshot.confirmedWrites ?? []), ack])
  },
  onQaPush(push, snapshot) {
    if (snapshot.section !== push.section || snapshot.viewedRound?.closedAt != null) return
    if (snapshot.viewedRound?.id !== push.roundId) return null
    if (snapshot.qaRevision !== undefined && push.revision <= snapshot.qaRevision) return
    if (push.baseRevision !== null && push.baseRevision !== snapshot.qaRevision) return null
    const base = push.baseRevision === null ? [] : snapshot.confirmedBase ?? snapshot.questions
    const versions = snapshot.versions ? { ...snapshot.versions, questions: '' } : undefined
    const view = { ...snapshot, qaRevision: push.revision, versions }
    return displayQuestions(view, mergeQuestions(base, push), snapshot.confirmedWrites ?? [])
  },
}

export function DiscussionFeed({ free, initialAsk }: { free: boolean; initialAsk: boolean }) {
  const requestedSection = useSearchParams().get('section')
  const [pinnedSection, setPinnedSection] = useState<MeetupSection | null>(null)
  const [questionJump, setQuestionJump] = useState(initialAsk ? 1 : 0)
  const completedJump = useRef(0)
  const nicknameForm = useRef<HTMLFormElement>(null)
  const questionForm = useRef<HTMLDivElement>(null)
  const selected = free ? 'lounge' : isMeetupSection(requestedSection) && requestedSection !== 'lounge'
    ? requestedSection : pinnedSection
  const [round, setRound] = useState<number | null>(null)
  const [pageStack, setPageStack] = useState<number[]>([])
  const before = pageStack.at(-1)
  const params = new URLSearchParams()
  if (selected) params.set('section', selected)
  if (round) params.set('round', String(round))
  if (before) params.set('before', String(before))
  const { data, error, pending, submit, retry, unauthorized } = useDiscussion<FeedView>(`/api/discussion?${params}`, 'discussion', feedTransport)
  const named = Boolean(data?.nickname)
  const active = data?.activeRound
  const viewed = data?.viewedRound
  const showQuestions = free || data?.section !== 'lounge'
  const liveRound = Boolean(showQuestions && viewed && viewed.id === active?.id)

  useEffect(() => {
    if (questionJump === completedJump.current || !liveRound) return
    if (!named) {
      nicknameForm.current?.scrollIntoView({ block: 'start' })
      return
    }
    if (!questionForm.current) return
    completedJump.current = questionJump
    questionForm.current.scrollIntoView({ block: 'start' })
    // A cross-page jump is consumed once, so a refresh does not pull the user back here.
    const url = new URL(window.location.href)
    if (url.searchParams.has('ask')) {
      url.searchParams.delete('ask')
      window.history.replaceState(null, '', url)
    }
  }, [questionJump, liveRound, named])

  function choose(section: MeetupSection | null, ask = false) {
    if (!free) window.history.replaceState(null, '', meetupDiscussionPath(section ?? undefined))
    setPinnedSection(null)
    setRound(null)
    setPageStack([])
    if (ask) setQuestionJump(jump => jump + 1)
    else completedJump.current = questionJump
  }

  async function setNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('nickname') ?? '')
    await submit({ action: 'nickname', name })
  }

  const section = selected ?? data?.section
  const inBreakout = section !== undefined && (section === 'breakout' || isBreakoutGroup(section))
  const navigation = !free && (
    <nav key="discussion-sections" aria-label="议程板块" className="border-b border-dams-line px-4 pb-3 sm:px-6">
      <ul className="divide-y divide-dams-line overflow-hidden rounded-xl border border-dams-line bg-white md:grid md:grid-cols-4 md:divide-x md:divide-y-0">
        {MEETUP_DISCUSSION_AGENDA.map(({ section: key, start, end }) => (
          <li key={key} className="min-w-0">
            <button type="button" aria-pressed={section === key || (key === 'breakout' && section !== undefined && isBreakoutGroup(section))}
              className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-dams-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dams-blue aria-pressed:bg-dams-selection aria-pressed:font-semibold aria-pressed:text-dams-hover md:h-full md:flex-col md:items-start md:justify-center md:gap-1"
              onClick={() => choose(key)}>
              <span className="min-w-0 wrap-anywhere">
                {MEETUP_SECTIONS[key]}
                {active?.section === key && <span className={`ml-1 ${qaStatus}`}>问答中</span>}
              </span>
              <span className="shrink-0 text-xs font-normal tabular-nums text-slate-600">{start}–{end}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected !== null ? (
        <button type="button" className="mt-1 min-h-11 px-2 text-sm font-medium text-dams-hover hover:underline"
          onClick={() => choose(null)}>恢复跟随现场</button>
      ) : section === 'lounge' && <p className="pt-2 text-xs text-slate-600">跟随现场 · 公共讨论区</p>}
    </nav>
  )
  const breakoutNavigation = inBreakout && (
    <div key="breakout-groups" className="flex flex-col gap-1 border-b border-dams-line bg-dams-wash px-4 py-2 min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-3 sm:px-6">
      <label htmlFor="breakout-group" className="shrink-0 text-sm font-semibold">交流分组</label>
      <select id="breakout-group" className={`${discussionInput} max-w-sm`} value={section}
        onChange={(event) => choose(event.currentTarget.value as MeetupSection)}>
        <option value="breakout">公共交流</option>
        {Object.entries(MEETUP_BREAKOUT_GROUPS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
    </div>
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
      {breakoutNavigation}
      <div className="px-4 py-5 sm:px-6">
        {feedback || <p role="status">正在加载讨论区…</p>}
      </div>
    </div>
  )

  const qaSection = active?.section === 'lounge' ? '自由讨论区' : active ? MEETUP_SECTIONS[active.section] : null
  const qaLink = active && (active.section === 'lounge') !== free ? `${meetupDiscussionPath(active.section)}&ask=1` : null
  const posts = data.items.filter((entry) => entry.kind === 'post')
  return (
    <div>
      {active && !liveRound && (
        <aside aria-label="进行中的问答" className={`mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-dams-orange bg-dams-orange-wash px-4 py-3 sm:mx-6 ${navigation ? 'mb-3' : ''}`}>
          <div className="min-w-0 wrap-anywhere">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className={qaStatus}>问答中</span>{questionRoundTitle(active)}</p>
            <p className="text-sm text-slate-700">{qaSection}</p>
          </div>
          {qaLink ? (
            <Link href={qaLink} scroll={false} className={qaAction}>前往提问</Link>
          ) : (
            <button type="button" className={qaAction}
              onClick={() => choose(active.section, true)}>前往提问</button>
          )}
        </aside>
      )}
      {navigation}
      {breakoutNavigation}
      <div className="space-y-4 border-b border-dams-line px-4 py-4 sm:px-6">
        <div className="contents flex-wrap items-center justify-between gap-2 md:flex">
          <h2 className="sr-only text-sm font-semibold md:not-sr-only">{MEETUP_SECTIONS[data.section]}</h2>
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <p className="rounded-full bg-dams-wash px-3 py-1 text-xs text-dams-hover">现场 · {MEETUP_SECTIONS[data.currentSection]}</p>
          </div>
        </div>
        {feedback}
        {!named && (
          <form ref={nicknameForm} className="scroll-mt-4 space-y-2 rounded-xl border border-dams-line bg-white p-3" onSubmit={setNickname}>
            <label htmlFor="feed-nickname" className="block text-sm text-slate-600">填个昵称，就能发帖、回复和提问</label>
            <div className="flex gap-2">
              <input id="feed-nickname" name="nickname" className={discussionInput} placeholder="昵称" autoComplete="nickname" maxLength={48} required />
              <button className={`${discussionButton} shrink-0 border-dams-line text-dams-hover`} disabled={pending}>保存昵称</button>
            </div>
          </form>
        )}
        {showQuestions && data.rounds.some((entry) => entry.section === data.section) && (
          <section aria-label="问答" className="space-y-3 rounded-xl border border-dams-selection bg-dams-wash p-3 sm:p-4">
            <h3 className="font-semibold">问答</h3>
            {liveRound && viewed && (
              <div ref={questionForm} className="scroll-mt-4 space-y-3 rounded-xl border-2 border-dams-blue bg-white p-3 sm:p-4">
                <p className="flex flex-wrap items-center gap-2 font-semibold wrap-anywhere"><span className={qaStatus}>问答中</span>{questionRoundTitle(viewed)}</p>
                {named ? (
                  <DiscussionComposer key={viewed.id} label="你的问题" action="提交问题" pending={pending}
                    featured accent maxLength={MAX_QUESTION_BODY} placeholder="你想问什么？"
                    onSubmit={(body) => submit({ action: 'question', section: data.section, roundId: viewed.id, body })} />
                ) : <p className="text-sm text-slate-700">填写上方昵称后即可提问。</p>}
              </div>
            )}
            <label htmlFor="discussion-round" className="block text-sm">查看本板块问答轮次</label>
              <select id="discussion-round" className={discussionInput} value={round ?? ''}
                onChange={(event) => {
                  if (event.target.value) setPinnedSection(data.section)
                  setRound(event.target.value ? Number(event.target.value) : null)
                }}>
                <option value="">当前问答</option>
                {data.rounds.filter((entry) => entry.section === data.section && entry.closedAt !== null)
                  .map((entry) => <option key={entry.id} value={entry.id}>第 {entry.id} 轮 · {questionRoundTitle(entry)}</option>)}
              </select>
            {viewed ? (
              <>
                {!liveRound && <p className="wrap-anywhere font-medium">第 {viewed.id} 轮 · {questionRoundTitle(viewed)} · 已结束</p>}
                {data.questions.length ? (
                  <ol className="space-y-2">
                    {data.questions.map((question) => (
                      <li key={question.id} className="rounded border border-dams-line bg-white p-3">
                        <p className="whitespace-pre-wrap wrap-anywhere">{question.body}</p>
                        <MemberBadge id={question.authorId} name={question.author} mine={question.mine} />
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-zinc-600">{question.answered ? '已答' : '未答'}</p>
                          {liveRound ? (
                            <button type="button" className={`${qaLike} min-w-11 justify-center px-2 hover:bg-dams-wash aria-pressed:bg-dams-selection aria-pressed:font-semibold aria-pressed:text-dams-hover focus-visible:outline-2 focus-visible:outline-dams-blue disabled:opacity-50`}
                              aria-label={`问题点赞，${question.likes} 个赞`} aria-pressed={question.liked} disabled={pending}
                              onClick={() => void submit({ action: 'like', id: question.id, liked: !question.liked })}>
                              <span aria-hidden="true">👍</span>{question.likes}
                            </button>
                          ) : (
                            <p className="inline-flex items-center gap-1.5 text-sm tabular-nums text-slate-600">
                              <span aria-hidden="true">👍</span><span className="sr-only">点赞 </span>{question.likes}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm">本轮还没有问题。</p>}
              </>
            ) : <p className="text-sm">本板块当前没有进行中的问答。</p>}
          </section>
        )}
        {named && (
          <div className="rounded-xl border border-slate-300 bg-white p-4">
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
      {(before || data.nextBefore) && (
        <nav aria-label="帖子分页" className="flex items-center justify-center gap-3 px-4 py-3 sm:px-6">
          <button type="button" className={discussionButton} disabled={!before}
            onClick={() => setPageStack((stack) => stack.slice(0, -1))}>
            上一页
          </button>
          <span role="status" className="text-sm tabular-nums text-slate-600">第 {pageStack.length + 1} 页</span>
          <button type="button" className={discussionButton} disabled={!data.nextBefore} onClick={() => {
            const cursor = data.nextBefore
            if (cursor) {
              setPinnedSection(data.section)
              setPageStack((stack) => [...stack, cursor])
            }
          }}>下一页</button>
        </nav>
      )}
    </div>
  )
}
