'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FeedPost } from '@/lib/queries/posts'
import { fetchScreenData } from '@/lib/actions/screen'

const POLL_TICK_MS = 1_000 // ui re-render cadence
const REFRESH_MS = 10_000 // server-data poll cadence
const SLOT_MS = 30_000 // each poll/timeline slot
const TIMELINE_FOCUS_MS = 8_000 // each timeline post highlight duration

type Props = {
  initialPosts: FeedPost[]
  initialOnline: number
  eventName: string
  qrSlot: React.ReactNode
}

export function ScreenView({
  initialPosts,
  initialOnline,
  eventName,
  qrSlot,
}: Props) {
  const [posts, setPosts] = useState(initialPosts)
  const [online, setOnline] = useState(initialOnline)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), POLL_TICK_MS)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const snap = await fetchScreenData()
        if (cancelled) return
        setPosts(snap.posts)
        setOnline(snap.online)
      } catch {
        // network blip — next tick retries
      }
    }
    const id = setInterval(refresh, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const activePolls = useMemo(
    () =>
      posts.filter(
        (p) =>
          p.type === 'poll' &&
          (!p.poll_deadline || new Date(p.poll_deadline).getTime() > now),
      ),
    [posts, now],
  )

  // Cycle: [poll0 30s, poll1 30s, ..., timeline 30s], repeat.
  // If no active polls → always timeline.
  const slot = activePolls.length === 0
    ? { kind: 'timeline' as const }
    : (() => {
        const totalSlots = activePolls.length + 1
        const idx = Math.floor(now / SLOT_MS) % totalSlots
        if (idx === activePolls.length) return { kind: 'timeline' as const }
        return { kind: 'poll' as const, post: activePolls[idx] }
      })()

  return (
    <div className="flex h-svh w-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex w-full max-w-[1400px] items-baseline justify-between px-10 py-6 text-zinc-300">
        <h1 className="text-3xl font-semibold tracking-tight">{eventName}</h1>
        <div className="text-xl tabular-nums">
          在线 <span className="font-semibold text-white">{online}</span> 人
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 overflow-hidden px-10">
        {slot.kind === 'poll' ? (
          <PollSlot post={slot.post} now={now} />
        ) : (
          <TimelineSlot posts={posts} now={now} />
        )}
      </main>

      <footer className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-8 px-10 py-6">
        <div className="text-sm text-zinc-500">
          {activePolls.length > 0 ? (
            <span>
              进行中投票 {activePolls.length} 个 · 每 {SLOT_MS / 1000}s 切换
            </span>
          ) : (
            <span>暂无进行中投票</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <p className="text-right text-sm leading-tight text-zinc-300">
            扫码加入
            <br />
            <span className="text-zinc-500">参与发帖 / 投票</span>
          </p>
          <div className="rounded-md bg-white p-2">{qrSlot}</div>
        </div>
      </footer>
    </div>
  )
}

function TimelineSlot({ posts, now }: { posts: FeedPost[]; now: number }) {
  // Use only text posts for the focus rotation; polls already get takeover slots.
  const textPosts = posts.filter((p) => p.type === 'text').slice(0, 12)
  if (textPosts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <p className="text-2xl">还没有人发帖。扫码加入聊起来 👇</p>
      </div>
    )
  }
  const focusIdx = Math.floor(now / TIMELINE_FOCUS_MS) % textPosts.length
  const focus = textPosts[focusIdx]
  const upNext = textPosts.filter((_, i) => i !== focusIdx).slice(0, 4)

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-6">
      <article className="rounded-2xl bg-zinc-900 px-10 py-8 ring-1 ring-zinc-800">
        <PostHeader post={focus} large />
        <p className="mt-4 whitespace-pre-wrap text-3xl leading-snug text-white">
          {focus.body}
        </p>
        {focus.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {focus.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-zinc-800 px-3 py-1 text-base text-zinc-300"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </article>
      <div className="grid grid-cols-2 gap-3 overflow-hidden">
        {upNext.map((p) => (
          <article
            key={p.id}
            className="overflow-hidden rounded-xl bg-zinc-900/60 px-5 py-4 ring-1 ring-zinc-800"
          >
            <PostHeader post={p} />
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-lg text-zinc-200">
              {p.body}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

function PollSlot({ post, now }: { post: FeedPost; now: number }) {
  const totalVotes = post.poll_total_votes ?? 0
  const counts = post.poll_option_counts ?? {}
  const options = post.poll_options ?? []

  const remainingMs = post.poll_deadline
    ? new Date(post.poll_deadline).getTime() - now
    : null

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] gap-6 rounded-2xl bg-amber-500/10 px-10 py-8 ring-1 ring-amber-500/30">
      <div>
        <div className="mb-2 flex items-center gap-3">
          <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-zinc-950">
            投票进行中
          </span>
          <PostHeader post={post} compact />
        </div>
        <p className="whitespace-pre-wrap text-4xl font-semibold leading-tight text-white">
          {post.body}
        </p>
      </div>

      <div className="flex flex-col justify-center gap-3">
        {options.map((opt) => {
          const count = counts[opt.id] ?? 0
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          return (
            <div
              key={opt.id}
              className="relative overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-zinc-800"
            >
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-amber-500/30"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center gap-4 px-6 py-4">
                <span className="flex-1 text-2xl text-white">{opt.label}</span>
                <span className="shrink-0 text-2xl font-semibold tabular-nums text-zinc-200">
                  {pct}%
                </span>
                <span className="shrink-0 w-16 text-right text-base tabular-nums text-zinc-400">
                  {count} 票
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between text-base text-zinc-400">
        <span>
          {totalVotes} 票 · {post.poll_multi ? '多选' : '单选'}
        </span>
        <span>{remainingMs !== null ? formatRemaining(remainingMs) : '无截止'}</span>
      </div>
    </div>
  )
}

function PostHeader({
  post,
  large,
  compact,
}: {
  post: FeedPost
  large?: boolean
  compact?: boolean
}) {
  const a = post.author
  const name = a.is_vip ? a.vip_name ?? '嘉宾' : a.nickname ?? '匿名'
  const meta = a.is_vip ? a.vip_title : a.company
  const sizeName = large ? 'text-2xl' : compact ? 'text-base' : 'text-xl'
  const sizeMeta = large ? 'text-lg' : 'text-sm'
  return (
    <div className="flex items-baseline gap-2">
      <span className={`${sizeName} font-semibold text-white`}>{name}</span>
      {meta && <span className={`${sizeMeta} text-zinc-400`}>· {meta}</span>}
      {a.is_vip && (
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
          嘉宾
        </span>
      )}
    </div>
  )
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '已截止'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `还剩 ${h}h ${m}m`
  return `还剩 ${m}m`
}
