'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import type { FeedPost } from '@/lib/queries/posts'
import { displayName, displayMeta } from '@/lib/display'
import { POST_MAX_CHARS } from '@/lib/constants'
import {
  deletePostAction,
  setQuestionAnsweredAction,
  updatePostAction,
} from '@/lib/actions/posts'
import { Avatar } from './Avatar'
import { LikeButton } from './LikeButton'
import { PollCard } from './PollCard'
import { ReplySection } from './ReplySection'
import { UserCardTrigger } from './UserCard'

type Props = {
  post: FeedPost
  viewerId: string
  viewerCanDm: boolean
  viewerIsAdmin?: boolean
}

export function PostCard({ post, viewerId, viewerCanDm, viewerIsAdmin = false }: Props) {
  const author = post.author
  const name = displayName(author)
  const meta = displayMeta(author)
  const isPoll = post.type === 'poll'
  const isQuestion = post.type === 'question'
  const isAnswered = isQuestion && !!post.answered_at
  const isMine = post.user_id === viewerId

  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(post.body)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const remaining = POST_MAX_CHARS - body.length

  function onSaveEdit() {
    const trimmed = body.trim()
    if (!trimmed) {
      setError('内容不能为空')
      return
    }
    if (trimmed.length > POST_MAX_CHARS) {
      setError(`不能超过 ${POST_MAX_CHARS} 字`)
      return
    }
    startTransition(async () => {
      const res = await updatePostAction(post.id, trimmed, '')
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
    setBody(post.body)
  }

  function onDelete() {
    if (!window.confirm(isPoll ? '删除这条投票？所有投票数据会一起清掉。' : '删除这条帖子？回复也会一起删掉。')) return
    startTransition(async () => {
      const res = await deletePostAction(post.id)
      if (res.error) setError(res.error)
    })
  }

  function onToggleAnswered() {
    setError(null)
    startTransition(async () => {
      const res = await setQuestionAnsweredAction(post.id, !isAnswered)
      if (res.error) setError(res.error)
    })
  }

  return (
    <article
      id={`post-${post.id}`}
      className={
        'scroll-mt-20 rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ' +
        (isAnswered
          ? 'border-zinc-200 border-l-4 border-l-zinc-300 bg-zinc-50/60 opacity-70'
          : isQuestion
            ? 'border-rose-200 border-l-4 border-l-rose-400 bg-rose-50/40'
            : 'border-zinc-200')
      }
    >
      <header className="mb-2 flex items-center gap-2 text-sm">
        <UserCardTrigger
          user={{ id: post.user_id, ...author }}
          viewerCanDm={viewerCanDm}
          isMine={isMine}
          className="-mx-1 flex items-center gap-2 px-1 py-0.5 text-left"
        >
          <Avatar seed={post.user_id} user={author} size="sm" />
          <span className="font-semibold text-zinc-900">{name}</span>
          {meta && <span className="text-zinc-500">· {meta}</span>}
          {author.is_vip && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              嘉宾
            </span>
          )}
        </UserCardTrigger>
        {isPoll && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
            投票
          </span>
        )}
        {isQuestion && !isAnswered && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
            提问
          </span>
        )}
        {isAnswered && (
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
            已答 ✓
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-400"><RelativeTime iso={post.created_at} /></span>
        {viewerIsAdmin && isQuestion && (
          <button
            type="button"
            onClick={onToggleAnswered}
            disabled={pending}
            className={
              'rounded px-1.5 py-0.5 text-xs disabled:opacity-50 ' +
              (isAnswered
                ? 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                : 'text-rose-600 hover:bg-rose-100 hover:text-rose-800')
            }
            title="主办方专用：标记问题是否已被嘉宾回答"
          >
            {isAnswered ? '取消已答' : '标已答'}
          </button>
        )}
        {isMine && !editing && (
          <div className="flex items-center gap-1">
            {!isPoll && !isQuestion && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              >
                编辑
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            >
              删除
            </button>
          </div>
        )}
      </header>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={POST_MAX_CHARS}
            rows={4}
            className="w-full resize-none rounded-md border border-zinc-200 bg-white px-3 py-2 text-[15px] focus:border-zinc-400 focus:outline-none"
          />
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className={remaining < 0 ? 'text-red-500' : ''}>
              {remaining < 0 ? remaining : ''}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={pending}
                className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={pending || body.trim().length === 0 || remaining < 0}
                className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                {pending ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
          {post.body}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {isMine && post.match_intent && (
        <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs">
          <div className="mb-0.5 font-medium text-violet-800">
            你想找 · 仅你可见
          </div>
          <p className="whitespace-pre-wrap text-violet-900">{post.match_intent}</p>
        </div>
      )}

      {isPoll && post.poll_options && (
        <PollCard
          postId={post.id}
          options={post.poll_options}
          multi={post.poll_multi ?? false}
          hideResults={post.poll_hide_results ?? false}
          closed={isPollClosed(post.poll_deadline)}
          canClose={isMine}
          totalVotes={post.poll_total_votes ?? 0}
          optionCounts={post.poll_option_counts ?? {}}
          myVoteOptions={post.poll_my_vote_options ?? []}
        />
      )}

      <div className="mt-3 flex items-center gap-1">
        <LikeButton postId={post.id} count={post.like_count} liked={post.liked_by_me} />
      </div>

      <ReplySection postId={post.id} count={post.reply_count} replies={post.replies} viewerId={viewerId} viewerCanDm={viewerCanDm} />
    </article>
  )
}

function isPollClosed(deadline: string | null): boolean {
  if (!deadline) return false
  return Date.now() >= new Date(deadline).getTime()
}

// SSR + 首次 hydrate 都用绝对时间（带固定时区，server/client 一致）；
// useEffect 之后才切相对时间。这样不会触发 hydration mismatch。
function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })
}

function formatRelative(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return formatAbsolute(iso)
}

function subscribeMinute(callback: () => void): () => void {
  const id = setInterval(callback, 60_000)
  return () => clearInterval(id)
}

function RelativeTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribeMinute,
    () => formatRelative(iso),
    () => formatAbsolute(iso),
  )
  return <>{text}</>
}
