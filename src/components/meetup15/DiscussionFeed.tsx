'use client'

import { useState, type FormEvent } from 'react'
import type { DiscussionItem, FeedSnapshot, MemberCommand } from '@/lib/meetup15/discussion'
import { MEETUP_SECTIONS, type MeetupSection } from '@/lib/meetup15/event'
import { MemberBadge } from './MemberBadge'
import { DiscussionComposer, discussionButton, discussionInput } from './DiscussionComposer'
import { ReplyReactions } from './ReplyReactions'
import { useDiscussion } from './useDiscussion'

type Submit = (command: MemberCommand) => Promise<boolean>

function PostCard({ post, replies, named, pending, submit }: {
  post: DiscussionItem
  replies: DiscussionItem[]
  named: boolean
  pending: boolean
  submit: Submit
}) {
  const [editor, setEditor] = useState<{ kind: 'edit' | 'reply'; id: number } | null>(null)
  const cancel = () => setEditor(null)
  const send = async (command: MemberCommand) => {
    const ok = await submit(command)
    if (ok) cancel()
    return ok
  }

  function renderEntry(item: DiscussionItem) {
    const isPost = item.kind === 'post'
    const canReply = named && item.parentId === null
    return (
      <div className="space-y-2">
        <MemberBadge id={item.authorId} name={item.author} mine={item.mine} />
        {editor?.kind === 'edit' && editor.id === item.id ? (
          <DiscussionComposer label={isPost ? '编辑帖子正文' : '编辑回复正文'} action="保存修改"
            pending={pending} initialBody={item.body} initialTags={isPost ? item.tags : undefined} onCancel={cancel}
            onSubmit={(body, tags) => send({ action: 'edit', id: item.id, body, tags })} />
        ) : (
          <p className="whitespace-pre-wrap break-words">{item.body}</p>
        )}
        {isPost && item.tags.length > 0 && (
          <ul aria-label="帖子标签" className="flex flex-wrap gap-2 text-xs text-teal-800">
            {item.tags.map((tag) => <li key={tag}>#{tag}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {isPost && (
            <button className={discussionButton} aria-pressed={item.liked} disabled={pending}
              onClick={() => void submit({ action: 'like', id: item.id, liked: !item.liked })}>
              点赞 {item.likes}
            </button>
          )}
          {canReply && (
            <button className={discussionButton} disabled={pending} onClick={() => setEditor({ kind: 'reply', id: item.id })}>
              {isPost ? '回复帖子' : '回复这条'}
            </button>
          )}
          {item.mine && (
            <>
              <button className={discussionButton} disabled={pending} onClick={() => setEditor({ kind: 'edit', id: item.id })}>
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
        {!isPost && <ReplyReactions item={item} pending={pending} submit={submit} />}
        {editor?.kind === 'reply' && editor.id === item.id && (
          <DiscussionComposer label={isPost ? '回复正文' : '子回复正文'} action="发表回复" pending={pending}
            onCancel={cancel} onSubmit={(body) => send({
              action: 'reply', postId: post.id, parentId: isPost ? null : item.id, body,
            })} />
        )}
      </div>
    )
  }

  const roots = replies.filter((reply) => reply.parentId === null)
  return (
    <article className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      {renderEntry(post)}
      {roots.map((reply) => (
        <div key={reply.id} className="space-y-3 border-t border-zinc-200 pt-3">
          {renderEntry(reply)}
          {replies.filter((child) => child.parentId === reply.id).map((child) => (
            <div key={child.id} className="ml-3 border-l border-zinc-300 pl-3">{renderEntry(child)}</div>
          ))}
        </div>
      ))}
    </article>
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
  const { data, error, pending, submit } = useDiscussion<FeedSnapshot>(`/api/discussion?${params}`)
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

  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在加载讨论区…'}</p>

  const active = data.activeRound
  const viewed = data.viewedRound
  const liveRound = viewed !== null && viewed.id === active?.id
  const posts = data.items.filter((entry) => entry.kind === 'post')
  return (
    <div className="space-y-5">
      <nav aria-label="讨论板块" className="flex flex-wrap gap-2">
        <button className={discussionButton} aria-pressed={selected === null}
          onClick={() => choose(null)}>跟随现场</button>
        {Object.entries(MEETUP_SECTIONS).map(([key, label]) => (
          <button key={key} className={discussionButton} aria-pressed={selected === key}
            onClick={() => choose(key as MeetupSection)}>{label}</button>
        ))}
      </nav>
      <p className="text-sm text-zinc-600">现场板块 · {MEETUP_SECTIONS[data.currentSection]}</p>
      <h2 className="text-xl font-semibold">{MEETUP_SECTIONS[data.section]}</h2>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!named && (
        <form className="space-y-2 rounded border border-zinc-200 p-3" onSubmit={setNickname}>
          <label className="block text-sm">填写昵称后可以发帖、回复和提问
            <input name="nickname" className={discussionInput} maxLength={48} required />
          </label>
          <button className={discussionButton} disabled={pending}>保存昵称</button>
        </form>
      )}
      {active && active.section !== data.section && (
        <p className="text-sm">问答正在 {MEETUP_SECTIONS[active.section]} 进行。
          <button className={discussionButton} onClick={() => choose(active.section)}>前往问答板块</button>
        </p>
      )}
      {data.rounds.some((entry) => entry.section === data.section) && (
        <section aria-label="问答" className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
          <h3 className="font-semibold">嘉宾问答</h3>
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
              <p className="font-medium">第 {viewed.id} 轮 · {viewed.guest}{liveRound ? ' · 进行中' : ' · 已结束'}</p>
              {liveRound && named && (
                <DiscussionComposer key={viewed.id} label="你的问题" action="提交问题" pending={pending}
                  onSubmit={(body) => submit({ action: 'question', section: data.section, roundId: viewed.id, body })} />
              )}
              {data.questions.length ? (
                <ol className="space-y-2">
                  {data.questions.map((question) => (
                    <li key={question.id} className="rounded border border-teal-100 bg-white p-3">
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
        <div className="space-y-2">
          <p className="text-xs text-zinc-600" aria-live="polite">发布到 {MEETUP_SECTIONS[data.section]}</p>
          <DiscussionComposer label="新帖正文" action="发表帖子" pending={pending} initialTags={[]}
            onSubmit={(body, tags) => submit({ action: 'post', section: data.section, body, tags })} />
        </div>
      )}
      {posts.length ? posts.map((post) => (
        <PostCard key={post.id} post={post} named={named} pending={pending} submit={submit}
          replies={data.items.filter((entry) => entry.postId === post.id).reverse()} />
      )) : <p className="text-sm text-zinc-600">暂无讨论。</p>}
      <div className="flex gap-2">
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
