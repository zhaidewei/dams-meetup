'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FeedPost } from '@/lib/queries/posts'
import type { ScreenQuestion } from '@/lib/queries/questions'
import type { ScreenLotteryDraw } from '@/lib/queries/lottery'
import type { ScreenModeState } from '@/lib/queries/event-state'
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
const SLOT_MS = 30_000 // each poll slot

type Props = {
  initialPosts: FeedPost[]
  initialOnline: number
  initialMode: ScreenModeState
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
  initialMode,
  eventName,
  section,
  liveSection,
  password,
  qrSlot,
}: Props) {
  const [posts, setPosts] = useState(initialPosts)
  const [questions, setQuestions] = useState<ScreenQuestion[]>([])
  const [lottery, setLottery] = useState<ScreenLotteryDraw | null>(null)
  const [online, setOnline] = useState(initialOnline)
  const [mode, setMode] = useState<ScreenModeState>(initialMode)
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
        setQuestions(snap.questions)
        setLottery(snap.lottery)
        setOnline(snap.online)
        setMode(snap.mode)
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

    // First refresh after mount fills questions for the initial mode (server
    // page already passes initialMode, but questions come from a separate fetch).
    void refresh()

    const sb = getBrowserSupabase()
    const channel = sb
      .channel('screen-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, bump)
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

  // Slot dispatch:
  //   1. screen_mode='qa'      → QA layout (admin-controlled, top priority)
  //   2. screen_mode='lottery' → Lottery animation + winner
  //   3. active polls          → cycle [poll0 30s, poll1 30s, ..., default 30s]
  //   4. default               → DefaultSlot
  let slot: SlotState
  if (mode.mode === 'qa') {
    slot = { kind: 'qa' }
  } else if (mode.mode === 'lottery' && lottery) {
    slot = { kind: 'lottery', draw: lottery }
  } else if (activePolls.length === 0) {
    slot = { kind: 'default' }
  } else {
    const totalSlots = activePolls.length + 1
    const idx = Math.floor(now / SLOT_MS) % totalSlots
    slot = idx === activePolls.length
      ? { kind: 'default' }
      : { kind: 'poll', post: activePolls[idx] }
  }

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
        {slot.kind === 'qa' ? (
          <QaSlot mode={mode} questions={questions} qrSlot={qrSlot} password={password} />
        ) : slot.kind === 'lottery' ? (
          <LotterySlot draw={slot.draw} now={now} />
        ) : slot.kind === 'poll' ? (
          <PollSlot post={slot.post} now={now} qrSlot={qrSlot} password={password} />
        ) : (
          <DefaultSlot
            liveSection={liveSection}
            online={online}
            qrSlot={qrSlot}
            password={password}
          />
        )}
      </main>
    </div>
  )
}

type SlotState =
  | { kind: 'default' }
  | { kind: 'qa' }
  | { kind: 'lottery'; draw: ScreenLotteryDraw }
  | { kind: 'poll'; post: FeedPost }

// Default slot: skeleton view shown when no poll is taking over.
// Layout = giant QR (left) + LIVE 板块演讲信息 + 在线人数 (right).
// 不再轮播热帖 — 主位留给当下正在发生的事（投票 / QA / 抽奖）。
function DefaultSlot({
  liveSection,
  online,
  qrSlot,
  password,
}: {
  liveSection: SectionId | null
  online: number
  qrSlot: React.ReactNode
  password: string
}) {
  const liveMeta = liveSection ? SECTION_META[liveSection] : null
  return (
    <div className="grid h-full grid-cols-[1fr_1fr] items-stretch gap-8">
      <div className="flex flex-col items-center justify-center gap-6 rounded-3xl bg-zinc-900/50 p-8 ring-1 ring-zinc-800">
        <div className="rounded-2xl bg-white p-5">{qrSlot}</div>
        <div className="text-center leading-tight">
          <p className="text-3xl font-semibold text-white">扫码一键加入</p>
          <p className="mt-1 text-base text-zinc-400">发帖 · 投票 · 找人</p>
        </div>
        {password && (
          <div className="w-full max-w-md rounded-2xl bg-zinc-800/80 px-6 py-4 text-center ring-1 ring-zinc-700">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">扫不动？手输密码</p>
            <p className="mt-1.5 select-all font-mono text-4xl font-semibold tracking-[0.18em] text-white">
              {password}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center gap-8 rounded-3xl bg-zinc-900/30 p-10 ring-1 ring-zinc-800/60">
        {liveSection && liveMeta ? (
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 ring-1 ring-rose-500/40">
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
              </span>
              <span className="text-sm font-semibold text-rose-300">现在 LIVE</span>
              <span className="text-sm text-zinc-200">{sectionLabel(liveSection)}</span>
            </div>
            <p className="text-4xl font-semibold leading-tight text-white">
              {liveMeta.topic}
            </p>
            {liveMeta.speaker && (
              <p className="mt-3 text-2xl text-zinc-200">
                {liveMeta.speaker}
                {liveMeta.affiliation && (
                  <span className="ml-2 text-xl text-zinc-400">· {liveMeta.affiliation}</span>
                )}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-3xl font-semibold text-zinc-300">空档期</p>
            <p className="mt-2 text-lg text-zinc-500">下一个板块即将开始</p>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-900/60 px-6 py-5 ring-1 ring-zinc-800">
          <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">在线人数</p>
          <p className="mt-1 text-6xl font-semibold tabular-nums text-white">{online}</p>
        </div>
      </div>
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
    <div className="grid grid-rows-[auto_1fr_auto] gap-6 rounded-2xl bg-blue-500/10 px-10 py-8 ring-1 ring-blue-500/30">
      <div>
        <div className="mb-2 flex items-center gap-3">
          <span className="rounded-full bg-blue-500 px-3 py-1 text-sm font-semibold text-white">
            投票进行中
          </span>
          <PostHeader post={post} />
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
                className="absolute inset-y-0 left-0 bg-blue-500/35"
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

// Lottery animation: ~5s spin then settle on the (server-determined) winner.
// Winner identity is fixed by the server; the animation is purely visual.
const LOTTERY_SPIN_MS = 5_000

function LotterySlot({ draw, now }: { draw: ScreenLotteryDraw; now: number }) {
  // `now` ticks every 1s from the parent; we derive phase from it (pure render).
  const startedAt = Date.parse(draw.created_at)
  const phase: 'spinning' | 'settled' =
    now - startedAt >= LOTTERY_SPIN_MS ? 'settled' : 'spinning'

  // Faster cadence (80–500ms) is needed for the avatar swap during spin —
  // 1s tick is too slow. Cell rotation lives in its own effect so it can
  // schedule itself with a decelerating timer.
  const [cellIdx, setCellIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    function tick() {
      if (cancelled) return
      const elapsed = Date.now() - startedAt
      if (elapsed >= LOTTERY_SPIN_MS) return
      setCellIdx((i) => (i + 1) % Math.max(1, draw.pool_sample.length))
      const t = Math.max(0, Math.min(1, elapsed / LOTTERY_SPIN_MS))
      const interval = 80 + t * 420
      timer = setTimeout(tick, interval)
    }

    if (Date.now() - startedAt < LOTTERY_SPIN_MS) {
      timer = setTimeout(tick, 80)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [draw.id, startedAt, draw.pool_sample.length])

  const current =
    phase === 'settled'
      ? draw.winner
      : draw.pool_sample[cellIdx % Math.max(1, draw.pool_sample.length)] ?? draw.winner

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="inline-flex items-center gap-3 rounded-full bg-amber-500/20 px-5 py-2 ring-1 ring-amber-500/40">
        <span className="text-base font-semibold text-amber-200">
          {phase === 'spinning' ? '抽奖中…' : '🎉 中奖！'}
        </span>
        <span className="text-xs text-amber-300/80">池子 {draw.pool_sample.length}+ 人</span>
      </div>

      <div
        className={
          'rounded-3xl p-12 ring-2 transition-all duration-500 ' +
          (phase === 'settled'
            ? 'scale-110 bg-amber-500/20 ring-amber-400 shadow-[0_0_120px_rgba(251,191,36,0.5)]'
            : 'bg-zinc-900/60 ring-zinc-700')
        }
      >
        <div className="flex flex-col items-center gap-6">
          <div className={phase === 'spinning' ? 'animate-pulse' : ''}>
            <Avatar seed={current.id} user={current} size="3xl" onDark />
          </div>
          <div className="text-center">
            <p className="text-6xl font-bold leading-tight text-white">{displayName(current)}</p>
            {displayMeta(current) && (
              <p className="mt-3 text-2xl text-zinc-300">{displayMeta(current)}</p>
            )}
            {current.is_vip && (
              <p className="mt-3">
                <span className="rounded-full bg-amber-500/30 px-3 py-1 text-base font-semibold text-amber-200">
                  嘉宾
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {phase === 'settled' && (
        <p className="text-lg text-zinc-400">
          {draw.rules.must_have_posted && '已发帖 · '}
          {draw.rules.exclude_previous_winners && '首次中奖'}
        </p>
      )}
    </div>
  )
}

function QaSlot({
  mode,
  questions,
  qrSlot,
  password,
}: {
  mode: ScreenModeState
  questions: ScreenQuestion[]
  qrSlot: React.ReactNode
  password: string
}) {
  const hostName = mode.qa_host_name ?? '嘉宾'
  const top = questions.slice(0, 5)
  const ticker = questions.slice(5, 13)

  return (
    <div className="grid h-full grid-cols-[1.1fr_1.4fr] gap-8">
      {/* Left: 嘉宾 + QR */}
      <div className="flex flex-col items-center justify-center gap-5 rounded-3xl bg-zinc-900/60 p-8 ring-1 ring-zinc-800">
        <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-4 py-1.5 ring-1 ring-rose-500/40">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
          </span>
          <span className="text-sm font-semibold text-rose-300">嘉宾 QA · 进行中</span>
        </div>
        <p className="text-center">
          <span className="block text-5xl font-semibold leading-tight text-white">{hostName}</span>
          {mode.qa_host_title && (
            <span className="mt-2 block text-xl text-zinc-300">{mode.qa_host_title}</span>
          )}
        </p>
        <div className="rounded-2xl bg-white p-4">{qrSlot}</div>
        <p className="text-center text-2xl font-semibold text-white">扫码向 {hostName} 提问</p>
        {password && (
          <div className="w-full max-w-sm rounded-2xl bg-zinc-800/80 px-4 py-3 text-center ring-1 ring-zinc-700">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">扫不动？手输密码</p>
            <p className="mt-1 select-all font-mono text-2xl font-semibold tracking-[0.2em] text-white">
              {password}
            </p>
          </div>
        )}
      </div>

      {/* Right: 问题列表 */}
      <div className="flex h-full min-h-0 flex-col gap-4">
        <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">
          观众提问 · 共 {questions.length} 条 · 按点赞排序
        </p>
        {questions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-2xl bg-zinc-900/40 ring-1 ring-zinc-800/60">
            <p className="text-2xl text-zinc-500">还没有人提问，扫码抢沙发 →</p>
          </div>
        ) : (
          <>
            <ul className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden">
              {top.map((q, i) => (
                <li
                  key={q.id}
                  className="flex gap-4 rounded-2xl bg-zinc-900 px-6 py-4 ring-1 ring-zinc-800"
                >
                  <span className="shrink-0 text-3xl font-bold tabular-nums text-zinc-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-2xl leading-snug text-white">
                      {q.body}
                    </p>
                    <p className="mt-2 flex items-center gap-3 text-sm text-zinc-400">
                      <span>{displayName(q.author)}</span>
                      {displayMeta(q.author) && (
                        <span className="text-zinc-500">· {displayMeta(q.author)}</span>
                      )}
                      <span className="ml-auto font-semibold text-rose-300">
                        ❤ {q.like_count}
                      </span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {ticker.length > 0 && (
              <div className="rounded-2xl bg-zinc-900/40 px-5 py-3 ring-1 ring-zinc-800/60">
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  排队中
                </p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-zinc-300">
                  {ticker.map((q) => (
                    <li key={q.id} className="flex items-center gap-2 truncate">
                      <span className="shrink-0 text-xs text-rose-400">❤{q.like_count}</span>
                      <span className="truncate">{q.body}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PostHeader({ post }: { post: FeedPost }) {
  const a = post.author
  const name = displayName(a)
  const meta = displayMeta(a)
  return (
    <div className="flex items-center gap-3">
      <Avatar seed={post.user_id} user={a} size="sm" onDark />
      <span className="text-base font-semibold text-white">{name}</span>
      {meta && <span className="text-sm text-zinc-400">· {meta}</span>}
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
