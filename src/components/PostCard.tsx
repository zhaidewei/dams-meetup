'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import type { FeedPost } from '@/lib/queries/posts'
import { displayName, displayMeta } from '@/lib/display'
import { POST_MAX_CHARS } from '@/lib/constants'
import { deletePostAction, updatePostAction } from '@/lib/actions/posts'
import { LikeButton } from './LikeButton'
import { PollCard } from './PollCard'
import { ReplySection } from './ReplySection'
import { DmButton } from './DmButton'

type Props = { post: FeedPost; viewerId: string; viewerCanDm: boolean }

export function PostCard({ post, viewerId, viewerCanDm }: Props) {
  const author = post.author
  const name = displayName(author)
  const meta = displayMeta(author)
  const isPoll = post.type === 'poll'
  const isMine = post.user_id === viewerId
  // 作者匿名（既无 nickname 又非 VIP）→ 无法接收 DM；按钮也藏起来。
  const authorIsAnon = author.nickname === null && !author.is_vip
  const canDm = viewerCanDm && !isMine && !authorIsAnon

  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(post.body)
  const [tags, setTags] = useState(post.tags.join(' '))
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
      const res = await updatePostAction(post.id, trimmed, tags)
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
    setTags(post.tags.join(' '))
  }

  function onDelete() {
    if (!window.confirm(isPoll ? '删除这条投票？所有投票数据会一起清掉。' : '删除这条帖子？回复也会一起删掉。')) return
    startTransition(async () => {
      const res = await deletePostAction(post.id)
      if (res.error) setError(res.error)
    })
  }

  return (
    <article id={`post-${post.id}`} className="scroll-mt-20 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="mb-2 flex items-baseline gap-2 text-sm">
        <span className="font-semibold text-zinc-900">{name}</span>
        {meta && <span className="text-zinc-500">· {meta}</span>}
        {author.is_vip && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            嘉宾
          </span>
        )}
        {isPoll && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
            投票
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-400"><RelativeTime iso={post.created_at} /></span>
        {isMine && !editing && (
          <div className="flex items-center gap-1">
            {!isPoll && (
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
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="标签（空格分隔，最多 5 个）"
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
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

      {isPoll && post.poll_options && (
        <PollCard
          postId={post.id}
          options={post.poll_options}
          multi={post.poll_multi ?? false}
          hideResults={post.poll_hide_results ?? false}
          closed={isPollClosed(post.poll_deadline)}
          totalVotes={post.poll_total_votes ?? 0}
          optionCounts={post.poll_option_counts ?? {}}
          myVoteOptions={post.poll_my_vote_options ?? []}
        />
      )}

      {!isPoll && !editing && post.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {!isPoll && post.show_contact && author.contact_handle && (
        <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          联系方式：<span className="text-zinc-800">{author.contact_handle}</span>
        </p>
      )}

      <div className="mt-3 flex items-center gap-1">
        <LikeButton postId={post.id} count={post.like_count} liked={post.liked_by_me} />
        {canDm && <DmButton toUserId={post.user_id} />}
      </div>

      <ReplySection postId={post.id} count={post.reply_count} replies={post.replies} viewerId={viewerId} />
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
