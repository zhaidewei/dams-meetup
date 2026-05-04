'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import type { FeedPost } from '@/lib/queries/posts'
import { fetchScreenData } from '@/lib/actions/screen'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { sectionLabel, SECTION_META, type SectionId } from '@/lib/sections'
import { displayName, displayMeta } from '@/lib/display'
import { EVENT_END_ISO } from '@/lib/constants'
import { Avatar } from '@/components/Avatar'

const POLL_TICK_MS = 1_000 // ui re-render cadence
// Safety-net resync if the websocket drops silently — projection mode runs
// unattended for hours. Realtime events are the primary trigger.
const FALLBACK_REFRESH_MS = 60_000
const REALTIME_DEBOUNCE_MS = 500
const SLOT_MS = 30_000 // each poll/timeline slot
const TIMELINE_FOCUS_MS = 8_000 // each timeline post highlight duration

type Props = {
  initialPosts: FeedPost[]
  initialOnline: number
  eventName: string
  // 当前 URL 筛选板块；null 表示显示全部。
  section: SectionId | null
  // 当前实际 LIVE 板块（来自 getCurrentSection — 主办方覆写 → 议程时间表）；
  // 用于顶 bar 的 LIVE pill。可能与 URL section 不一致。
  liveSection: SectionId | null
  // 活动密码 — 作为兜底显示在 QR 旁边，扫不动码的人可以手输。
  password: string
  qrSlot: React.ReactNode
}

export function ScreenView({
  initialPosts,
  initialOnline,
  eventName,
  section,
  liveSection,
  password,
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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    async function refresh() {
      try {
        const snap = await fetchScreenData(section)
        if (cancelled) return
        setPosts(snap.posts)
        setOnline(snap.online)
      } catch {
        // network blip — fallback interval will retry
      }
    }

    function bump() {
      if (debounceTimer) return
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        void refresh()
      }, REALTIME_DEBOUNCE_MS)
    }

    const sb = getBrowserSupabase()
    const channel = sb
      .channel('screen-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, bump)
      .subscribe()

    const fallback = setInterval(refresh, FALLBACK_REFRESH_MS)

    return () => {
      cancelled = true
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(fallback)
      sb.removeChannel(channel)
    }
  }, [section])

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
      <ScreenTopBar
        eventName={eventName}
        liveSection={liveSection}
        filterSection={section}
        online={online}
        now={now}
      />

      <main className="mx-auto w-full max-w-[1600px] flex-1 overflow-hidden px-10 pb-6">
        {slot.kind === 'poll' ? (
          <PollSlot post={slot.post} now={now} qrSlot={qrSlot} password={password} />
        ) : (
          <TimelineSlot posts={posts} now={now} qrSlot={qrSlot} password={password} />
        )}
      </main>
    </div>
  )
}

function TimelineSlot({
  posts,
  now,
  qrSlot,
  password,
}: {
  posts: FeedPost[]
  now: number
  qrSlot: React.ReactNode
  password: string
}) {
  // Use only text posts for the focus rotation; polls already get takeover slots.
  const textPosts = posts.filter((p) => p.type === 'text').slice(0, 12)
  if (textPosts.length === 0) {
    return (
      <div className="grid h-full grid-cols-[1.6fr_1fr] gap-6">
        <div className="flex items-center justify-center rounded-2xl bg-zinc-900/40 ring-1 ring-zinc-800/60 text-zinc-500">
          <p className="flex items-center gap-2 text-2xl">
            还没有人发帖。扫码加入聊起来
            <ArrowDown className="size-6" aria-hidden />
          </p>
        </div>
        <QrPanel qrSlot={qrSlot} password={password} />
      </div>
    )
  }
  const focusIdx = Math.floor(now / TIMELINE_FOCUS_MS) % textPosts.length
  const focus = textPosts[focusIdx]
  const upNext = textPosts.filter((_, i) => i !== focusIdx).slice(0, 4)

  return (
    <div className="grid h-full grid-rows-[1fr_auto] gap-5">
      <div className="grid min-h-0 grid-cols-[1.6fr_1fr] gap-6">
        <article className="overflow-hidden rounded-2xl bg-zinc-900 px-10 py-8 ring-1 ring-zinc-800">
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
        <QrPanel qrSlot={qrSlot} password={password} />
      </div>
      {upNext.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {upNext.map((p) => (
            <article
              key={p.id}
              className="overflow-hidden rounded-xl bg-zinc-900/60 px-5 py-4 ring-1 ring-zinc-800"
            >
              <PostHeader post={p} />
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-base text-zinc-200">
                {p.body}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function QrPanel({ qrSlot, password }: { qrSlot: React.ReactNode; password: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-zinc-900/60 px-8 py-6 ring-1 ring-zinc-800">
      <div className="rounded-xl bg-white p-3">{qrSlot}</div>
      <p className="text-center leading-tight">
        <span className="block text-xl font-semibold text-white">扫码一键加入</span>
        <span className="text-sm text-zinc-400">发帖 / 投票 / 找人</span>
      </p>
      {password && (
        <div className="w-full rounded-xl bg-zinc-800/80 px-4 py-3 text-center ring-1 ring-zinc-700">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">扫不动？手输密码</p>
          <p className="mt-1 select-all font-mono text-3xl font-semibold tracking-wider text-white">
            {password}
          </p>
        </div>
      )}
    </div>
  )
}

function PollSlot({
  post,
  now,
  qrSlot,
  password,
}: {
  post: FeedPost
  now: number
  qrSlot: React.ReactNode
  password: string
}) {
  const totalVotes = post.poll_total_votes ?? 0
  const counts = post.poll_option_counts ?? {}
  const options = post.poll_options ?? []

  const remainingMs = post.poll_deadline
    ? new Date(post.poll_deadline).getTime() - now
    : null

  return (
    <div className="grid h-full grid-cols-[1.6fr_1fr] gap-6">
    <div className="grid grid-rows-[auto_1fr_auto] gap-6 rounded-2xl bg-indigo-500/10 px-10 py-8 ring-1 ring-indigo-500/30">
      <div>
        <div className="mb-2 flex items-center gap-3">
          <span className="rounded-full bg-indigo-500 px-3 py-1 text-sm font-semibold text-white">
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
                className="absolute inset-y-0 left-0 bg-indigo-500/35"
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
      <QrPanel qrSlot={qrSlot} password={password} />
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
  const name = displayName(a)
  const meta = displayMeta(a)
  const sizeName = large ? 'text-2xl' : compact ? 'text-base' : 'text-xl'
  const sizeMeta = large ? 'text-lg' : 'text-sm'
  const avatarSize = large ? 'lg' : compact ? 'sm' : 'md'
  return (
    <div className="flex items-center gap-3">
      <Avatar seed={post.user_id} user={a} size={avatarSize} onDark />
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

function ScreenTopBar({
  eventName,
  liveSection,
  filterSection,
  online,
  now,
}: {
  eventName: string
  liveSection: SectionId | null
  filterSection: SectionId | null
  online: number
  now: number
}) {
  const liveMeta = liveSection ? SECTION_META[liveSection] : null
  const clock = formatClock(now)
  const remainingMs = Date.parse(EVENT_END_ISO) - now
  const countdown = remainingMs > 0 ? formatRemaining(remainingMs) : '活动已结束'

  return (
    <header className="mx-auto flex w-full max-w-[1600px] items-center gap-6 px-10 py-5 text-zinc-300">
      <h1 className="text-2xl font-semibold tracking-tight text-white">{eventName}</h1>

      {liveSection && liveMeta ? (
        <div className="flex items-center gap-2 rounded-full bg-rose-500/15 px-3 py-1 ring-1 ring-rose-500/30">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
          </span>
          <span className="text-sm font-semibold text-rose-300">LIVE</span>
          <span className="text-sm text-zinc-200">
            {sectionLabel(liveSection)}
            {liveMeta.speaker && ` · ${liveMeta.speaker}`}
          </span>
        </div>
      ) : (
        <span className="text-sm text-zinc-500">空档期 / 活动外</span>
      )}

      {filterSection && filterSection !== liveSection && (
        <span className="rounded-full bg-zinc-800/70 px-2.5 py-1 text-xs text-zinc-400">
          视图：仅显示 {sectionLabel(filterSection)}
        </span>
      )}

      <div className="ml-auto flex items-center gap-6 text-base tabular-nums">
        <span className="text-2xl font-semibold tracking-tight text-white">{clock}</span>
        <span className="text-zinc-400">{countdown}</span>
        <span className="text-zinc-300">
          在线 <span className="font-semibold text-white">{online}</span> 人
        </span>
      </div>
    </header>
  )
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Amsterdam',
  })
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '已截止'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `还剩 ${h}h ${m}m`
  return `还剩 ${m}m`
}
