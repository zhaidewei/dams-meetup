'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import type { FeedPost } from '@/lib/queries/posts'
import type { ScreenQuestion } from '@/lib/queries/questions'
import type { ScreenLotteryDraw } from '@/lib/queries/lottery'
import type { ScreenModeState } from '@/lib/queries/event-state'
import { fetchScreenData } from '@/lib/actions/screen'
import { resolveLotteryAction } from '@/lib/actions/event-state'
import { setQuestionAnsweredAction } from '@/lib/actions/posts'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { sectionLabel, SECTION_META, type SectionId } from '@/lib/sections'
import { AGENDA, agendaRowByClock } from '@/lib/agenda'
import { displayName, displayMeta } from '@/lib/display'
import { EVENT_END_ISO } from '@/lib/constants'
import { Avatar } from '@/components/Avatar'
import { MatchCountdown } from '@/components/MatchCountdown'

const POLL_TICK_MS = 1_000 // ui re-render cadence
// Safety-net resync if the websocket drops silently — projection mode runs
// unattended for hours. Realtime events are the primary trigger.
//
// 15s 的依据（issue #36）：投票实时计数 — 改投后大屏在 30s 一格的轮播里，
// 即使 Realtime 偶尔丢一次 broadcast，最坏情况下用户也只能等 60s 才看到更
// 新过的票数 → 给人"改投失效"的错觉。15s 的兜底 + Realtime 主路 + debounce
// 一起，把最坏延迟从 60s 压到 15s，刷新成本对 Supabase 可以忽略。
const FALLBACK_REFRESH_MS = 15_000
// debounce = BASE + random(0..JITTER)。两个作用：
//   1. coalesce: 同一 burst 的多个 broadcast 合并成一次 refresh
//   2. de-herd: 多块 /screen tab 同时收到 broadcast 时，jitter 把 SSR 打散
//      到 [500, 1500] 区间，避免几块投影同时打 DB 形成微 spike
// 选 500-1500：median ~1s，投影感知不到延迟变化；fallback 15s 就在数量级外。
const DEBOUNCE_BASE_MS = 500
const DEBOUNCE_JITTER_MS = 1000
const SLOT_MS = 30_000 // each poll slot

type Props = {
  initialPosts: FeedPost[]
  initialOnline: number
  initialMode: ScreenModeState
  eventName: string
  // 当前实际 LIVE 板块（来自 getCurrentSection — 主办方覆写 → 议程时间表）；
  // 用于顶 bar 的 LIVE pill。可能与 filter 不一致。SSR 提供 initial 值，client
  // 通过 fetchScreenData refresh 持续同步（admin 切板块后自动跟随）。
  initialLiveSection: SectionId | null
  // 活动密码 — 作为兜底显示在 QR 旁边，扫不动码的人可以手输。
  password: string
  // 站点域名（不带 https://），用作"扫不动"的兜底入口提示。
  siteHost: string
  qrSlot: React.ReactNode
}

export function ScreenView({
  initialPosts,
  initialOnline,
  initialMode,
  eventName,
  initialLiveSection,
  password,
  siteHost,
  qrSlot,
}: Props) {
  const [posts, setPosts] = useState(initialPosts)
  const [questions, setQuestions] = useState<ScreenQuestion[]>([])
  const [answeredCount, setAnsweredCount] = useState(0)
  const [lottery, setLottery] = useState<ScreenLotteryDraw | null>(null)
  const [online, setOnline] = useState(initialOnline)
  const [mode, setMode] = useState<ScreenModeState>(initialMode)
  const [liveSection, setLiveSection] = useState<SectionId | null>(initialLiveSection)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), POLL_TICK_MS)
    return () => clearInterval(tick)
  }, [])

  // 依赖 mode.mode：QA 模式下才订 likes（按赞排序问题），其他模式 likes 是
  // 纯噪声。mode 切换时整个 channel 重建（~200ms 短暂订阅断窗），fallback
  // 15s 兜底覆盖这段；mode 切换本身就是 admin 主动触发的低频事件。
  const screenMode = mode.mode
  useEffect(() => {
    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    async function refresh() {
      try {
        // filter 来源已升级为 server state（mode.screen_filter_section），
        // fetchScreenData 内部读 event_state 拿 filter，不再接 section 参数。
        const snap = await fetchScreenData()
        if (cancelled) return
        setPosts(snap.posts)
        setQuestions(snap.questions)
        setAnsweredCount(snap.questionsAnsweredCount)
        setLottery(snap.lottery)
        setOnline(snap.online)
        setMode(snap.mode)
        setLiveSection(snap.liveSection)
      } catch {
        // network blip — fallback interval will retry
      }
    }

    function bump() {
      if (debounceTimer) return
      const delay = DEBOUNCE_BASE_MS + Math.random() * DEBOUNCE_JITTER_MS
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        void refresh()
      }, delay)
    }

    // First refresh after mount fills questions for the initial mode (server
    // page already passes initialMode, but questions come from a separate fetch).
    void refresh()

    // replies 任何 slot 都不展示 → 不订。
    // likes 仅 QA 模式按赞排序问题时需要，其他 mode 不订。
    // posts/poll_votes/event_state 是常开依赖（新 poll/question/mode 切换）。
    const sb = getBrowserSupabase()
    let chain = sb
      .channel('screen-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, bump)
    if (screenMode === 'qa') {
      chain = chain.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'likes' },
        bump,
      )
    }
    const channel = chain.subscribe()

    const fallback = setInterval(refresh, FALLBACK_REFRESH_MS)

    return () => {
      cancelled = true
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(fallback)
      sb.removeChannel(channel)
    }
  }, [screenMode])

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
        filterSection={mode.screen_filter_section}
        online={online}
        now={now}
      />

      <main className="mx-auto w-full max-w-[1600px] flex-1 overflow-hidden px-10 pb-6">
        {slot.kind === 'qa' ? (
          // key 包含当前 host — 切轮次时 QaSlot 整个 remount，乐观隐藏 set 自动重置。
          <QaSlot
            key={mode.qa_host_user_id ?? 'no-host'}
            mode={mode}
            questions={questions}
            answeredCount={answeredCount}
            now={now}
            qrSlot={qrSlot}
            password={password}
            siteHost={siteHost}
          />
        ) : slot.kind === 'lottery' ? (
          // key=draw.id —— 切到下一轮抽奖时整个 LotterySlot remount，
          // 三阶段动画时钟、optimistic winner 自动重置。
          <LotterySlot key={slot.draw.id} draw={slot.draw} now={now} />
        ) : slot.kind === 'poll' ? (
          <PollSlot
            post={slot.post}
            now={now}
            qrSlot={qrSlot}
            password={password}
            siteHost={siteHost}
          />
        ) : (
          <DefaultSlot
            liveSection={liveSection}
            online={online}
            now={now}
            qrSlot={qrSlot}
            password={password}
            siteHost={siteHost}
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
  now,
  qrSlot,
  password,
  siteHost,
}: {
  liveSection: SectionId | null
  online: number
  now: number
  qrSlot: React.ReactNode
  password: string
  siteHost: string
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
        <JoinHint password={password} siteHost={siteHost} size="lg" />
      </div>

      {liveSection && liveMeta ? (
        <div className="flex flex-col justify-center gap-8 rounded-3xl bg-zinc-900/30 p-10 ring-1 ring-zinc-800/60">
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
          <div className="rounded-2xl bg-zinc-900/60 px-6 py-5 ring-1 ring-zinc-800">
            <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">在线人数</p>
            <p className="mt-1 text-6xl font-semibold tabular-nums text-white">{online}</p>
          </div>
        </div>
      ) : (
        <ScreenAgenda now={now} online={online} />
      )}
    </div>
  )
}

// 空档期 / 活动外的右半边：完整议程，按时间高亮当前行。底部一行"在线 X 人"。
function ScreenAgenda({ now, online }: { now: number; online: number }) {
  const activeRow = agendaRowByClock(new Date(now))
  return (
    <div className="flex h-full flex-col gap-4 rounded-3xl bg-zinc-900/30 p-8 ring-1 ring-zinc-800/60">
      <div className="flex items-baseline justify-between">
        <p className="text-xl font-semibold text-zinc-300">活动议程</p>
        <p className="text-sm text-zinc-500">2026-05-09 · Europe/Amsterdam</p>
      </div>
      <ol className="flex flex-1 flex-col divide-y divide-zinc-800 overflow-hidden rounded-xl ring-1 ring-zinc-800">
        {AGENDA.map((item, i) => {
          const isActive = i === activeRow
          return (
            <li
              key={item.time}
              className={
                'flex items-start gap-4 px-5 py-3 ' +
                (isActive ? 'bg-rose-500/15 ring-1 ring-inset ring-rose-500/40' : 'bg-zinc-900/40')
              }
            >
              <span
                className={
                  'mt-0.5 w-32 shrink-0 text-base tabular-nums ' +
                  (isActive ? 'font-semibold text-rose-300' : 'text-zinc-500')
                }
              >
                {item.time}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p
                  className={
                    'text-lg leading-tight ' +
                    (isActive ? 'font-semibold text-white' : 'text-zinc-200')
                  }
                >
                  {isActive && (
                    <span className="mr-2 inline-flex items-center gap-1 rounded bg-rose-500 px-1.5 py-0.5 align-middle text-[11px] font-bold text-white">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-white" />
                      </span>
                      LIVE
                    </span>
                  )}
                  {item.title}
                </p>
                {item.talks && (
                  <ul className="space-y-0.5">
                    {item.talks.map((t) => (
                      <li key={t.topic} className="text-sm text-zinc-400">
                        <span className="text-zinc-300">{t.speaker}</span>
                        <span className="ml-1.5 text-zinc-500">· {t.topic}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {item.sponsors && (
                  <p className="text-sm text-zinc-400">
                    {item.sponsors.map((s) => `${s.label} ${s.name.replace(/（.*$/, '')}`).join(' · ')}
                  </p>
                )}
                {item.panelists && (
                  <p className="text-sm text-zinc-400">{item.panelists.length} 位嘉宾圆桌</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>当前在线 <span className="font-semibold text-zinc-200">{online}</span> 人</span>
        <span>{activeRow < 0 ? '空档期 · 等待下个板块' : '正在进行中'}</span>
      </div>
    </div>
  )
}

function PollSlot({
  post,
  now,
  qrSlot,
  password,
  siteHost,
}: {
  post: FeedPost
  now: number
  qrSlot: React.ReactNode
  password: string
  siteHost: string
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
      <QrPanel qrSlot={qrSlot} password={password} siteHost={siteHost} />
    </div>
  )
}

function QrPanel({
  qrSlot,
  password,
  siteHost,
}: {
  qrSlot: React.ReactNode
  password: string
  siteHost: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-zinc-900/60 px-8 py-6 ring-1 ring-zinc-800">
      <div className="rounded-xl bg-white p-3">{qrSlot}</div>
      <p className="text-center leading-tight">
        <span className="block text-xl font-semibold text-white">扫码一键加入</span>
        <span className="text-sm text-zinc-400">发帖 / 投票 / 找人</span>
      </p>
      <JoinHint password={password} siteHost={siteHost} size="md" />
    </div>
  )
}

// 「扫不动」兜底：URL + 现场密码两段。
//   - 之前只显示密码，没 URL，会让人愣在那里不知道往哪输入
//   - URL 在前（先打开网页），密码在后（再输入），匹配实际操作顺序
//   - mono + select-all + tracking 让远处也能看清、近处可以一键复制
//   - size 适配三种宿主：lg=DefaultSlot 大留白，md=QrPanel 中等，sm=QaSlot 紧凑
function JoinHint({
  password,
  siteHost,
  size,
}: {
  password: string
  siteHost: string
  size: 'sm' | 'md' | 'lg'
}) {
  if (!siteHost && !password) return null
  const urlClass =
    size === 'lg'
      ? 'text-3xl tracking-wider'
      : size === 'md'
        ? 'text-2xl tracking-wide'
        : 'text-xl tracking-wide'
  const passClass =
    size === 'lg'
      ? 'text-4xl tracking-[0.18em]'
      : size === 'md'
        ? 'text-3xl tracking-wider'
        : 'text-2xl tracking-[0.2em]'
  const wrapClass =
    size === 'lg' ? 'max-w-md px-6 py-4' : size === 'md' ? 'px-4 py-3' : 'max-w-sm px-4 py-3'
  return (
    <div
      className={`w-full ${wrapClass} space-y-2 rounded-2xl bg-zinc-800/80 text-center ring-1 ring-zinc-700`}
    >
      {siteHost && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">扫不动？打开</p>
          <p className={`mt-0.5 select-all font-mono font-semibold text-white ${urlClass}`}>
            {siteHost}
          </p>
        </div>
      )}
      {password && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">现场密码</p>
          <p className={`mt-0.5 select-all font-mono font-semibold text-white ${passClass}`}>
            {password}
          </p>
        </div>
      )}
    </div>
  )
}

// 抽奖 v2：三阶段状态机（docs/lottery-design-v2.md §4）
//   A. 候选预览  PREVIEW_MS   滚动展示池子，让观众肉眼确认
//   B. 跑马灯    SPIN_MS      加速→减速，停帧瞬间调 resolveLotteryAction
//   C. 揭晓      —            winner 放大 + glow + 礼花
//
// 关键设计：phase 切换由 client 时钟（draw.created_at + 偏移）驱动；
// winner 在 B → C 切换那一刻才向 server 索要，主办方/server 都没机会
// 提前知道结果。draw.closed_at 用作幂等：第二次进入 C（重渲染、F5）
// 直接用 draw.winner 显示，不重抽。
const PREVIEW_MS = 2_500
const SPIN_MS = 4_500
const PHASE_B_START = PREVIEW_MS
const PHASE_C_START = PREVIEW_MS + SPIN_MS

function LotterySlot({ draw, now }: { draw: ScreenLotteryDraw; now: number }) {
  const startedAt = Date.parse(draw.created_at)
  const elapsed = now - startedAt

  // 已 closed 的 draw（refresh 后回到这里）：跳过动画直接到 C 阶段。
  const alreadySettled = !!draw.closed_at && !!draw.winner
  const phase: 'preview' | 'spin' | 'reveal' = alreadySettled
    ? 'reveal'
    : elapsed < PHASE_B_START
      ? 'preview'
      : elapsed < PHASE_C_START
        ? 'spin'
        : 'reveal'

  // 乐观 winner：B 阶段尾巴向 server 拿一次。父组件 key=draw.id 保证
  // 切下一轮时 remount，optimistic 自动重置，无需 useEffect 同步 props。
  // 渲染时 server-truth (draw.winner) 优先于乐观值。
  const [optimisticWinner, setOptimisticWinner] = useState<typeof draw.winner>(null)
  const winnerForReveal = draw.winner ?? optimisticWinner

  useEffect(() => {
    if (alreadySettled) return
    if (winnerForReveal) return // 已经有 winner（server 或 optimistic），别再请求
    if (phase !== 'spin' && phase !== 'reveal') return
    let cancelled = false
    void (async () => {
      const res = await resolveLotteryAction(draw.id)
      if (cancelled || res.error || !res.winnerId) return
      const winnerInSample = draw.pool_sample.find((u) => u.id === res.winnerId)
      if (winnerInSample) setOptimisticWinner(winnerInSample)
      // 不在 sample 里：等下一次 fetchScreenData refresh 带来完整 draw.winner。
    })()
    return () => {
      cancelled = true
    }
  }, [draw.id, phase, alreadySettled, winnerForReveal, draw.pool_sample])

  // 跑马灯快速切换头像（80→500ms 缓动）
  const [cellIdx, setCellIdx] = useState(0)
  useEffect(() => {
    if (phase !== 'spin') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    function tick() {
      if (cancelled) return
      const e = Date.now() - startedAt - PHASE_B_START
      if (e >= SPIN_MS) return
      setCellIdx((i) => (i + 1) % Math.max(1, draw.pool_sample.length))
      const t = Math.max(0, Math.min(1, e / SPIN_MS))
      timer = setTimeout(tick, 80 + t * 420)
    }
    timer = setTimeout(tick, 80)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [phase, draw.id, draw.pool_sample.length, startedAt])

  if (phase === 'preview') {
    return <LotteryPreview draw={draw} elapsed={elapsed} />
  }

  // spin / reveal 共用大卡片布局；reveal 时有 winner，spin 时是滚头像
  const current =
    phase === 'reveal' && winnerForReveal
      ? winnerForReveal
      : draw.pool_sample[cellIdx % Math.max(1, draw.pool_sample.length)]

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-8">
      {phase === 'reveal' && <Confetti />}

      <div
        className={
          'inline-flex items-center gap-3 rounded-full px-5 py-2 ring-1 ' +
          (phase === 'reveal'
            ? 'bg-amber-500/30 ring-amber-400'
            : 'bg-amber-500/20 ring-amber-500/40')
        }
      >
        <span className="text-base font-semibold text-amber-200">
          {phase === 'reveal' ? '🎉 中奖！' : '抽奖中…'}
        </span>
        <span className="text-xs text-amber-300/80">池子 {draw.pool_size} 人</span>
      </div>

      {current && (
        <div
          className={
            'rounded-3xl p-12 ring-2 transition-all duration-500 ' +
            (phase === 'reveal'
              ? 'scale-110 bg-amber-500/20 ring-amber-400 shadow-[0_0_120px_rgba(251,191,36,0.5)]'
              : 'bg-zinc-900/60 ring-zinc-700')
          }
        >
          <div className="flex flex-col items-center gap-6">
            <div className={phase === 'spin' ? 'animate-pulse' : ''}>
              <Avatar seed={current.id} user={current} size="3xl" onDark />
            </div>
            <div className="text-center">
              <p className="text-6xl font-bold leading-tight text-white">
                {displayName(current)}
              </p>
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
      )}

      {phase === 'reveal' && <LotteryAuditFooter draw={draw} />}
    </div>
  )
}

// A 阶段：候选预览 —— 让观众肉眼确认池子
function LotteryPreview({
  draw,
  elapsed,
}: {
  draw: ScreenLotteryDraw
  elapsed: number
}) {
  // 渐进 fade-in：每 60ms 显示下一个，2.5s 内最多覆盖 ~40 人
  const visibleCount = Math.min(
    draw.pool_sample.length,
    Math.max(8, Math.floor((elapsed / PREVIEW_MS) * draw.pool_sample.length)),
  )
  const visible = draw.pool_sample.slice(0, visibleCount)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8">
      <div className="inline-flex items-center gap-3 rounded-full bg-amber-500/20 px-5 py-2 ring-1 ring-amber-500/40">
        <span className="text-base font-semibold text-amber-200">即将抽奖</span>
        <span className="text-xs text-amber-300/80">
          池子 {draw.pool_size} 人 ·{' '}
          {draw.rules.enable_weights === false ? '人均 1 票' : '加权 1-3 票'}
        </span>
      </div>

      <div className="grid w-full max-w-[1400px] grid-cols-8 gap-3">
        {visible.map((u) => (
          <div
            key={u.id}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-zinc-900/60 p-2.5 ring-1 ring-zinc-800 animate-in fade-in"
          >
            <Avatar seed={u.id} user={u} size="md" onDark />
            <p className="line-clamp-1 text-center text-xs text-zinc-200">
              {displayName(u)}
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm text-zinc-500">
        近 1 小时内活跃过
        {draw.rules.must_have_posted && ' · 必须参与过（帖/回复/投票）'}
        {draw.rules.exclude_previous_winners && ' · 排除上轮中奖者'}
        {draw.rules.exclude_vips && ' · 不含嘉宾'}
      </p>
    </div>
  )
}

function LotteryAuditFooter({ draw }: { draw: ScreenLotteryDraw }) {
  return (
    <p className="font-mono text-xs text-zinc-500">
      draw #{draw.id} · seed {draw.seed_short ?? '—'} · pool {draw.pool_size} 人
      {draw.rules.enable_weights === false ? ' · 人均 1 票' : ' · 加权 1-3 票'}
    </p>
  )
}

function Confetti() {
  // 纯 CSS 礼花：12 片彩色方块从顶部随机角度散落
  const pieces = Array.from({ length: 24 }, (_, i) => i)
  const colors = ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#f87171']
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((i) => {
        const left = (i * 4159) % 100
        const delay = (i * 137) % 800
        const duration = 1800 + ((i * 89) % 1200)
        const color = colors[i % colors.length]
        return (
          <span
            key={i}
            className="absolute -top-4 size-2 rounded-sm"
            style={{
              left: `${left}%`,
              backgroundColor: color,
              animation: `confetti-fall ${duration}ms ${delay}ms linear forwards`,
            }}
          />
        )
      })}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// QA 已进行时长 mm:ss（>=1h 显示 h:mm:ss）。qa_started_at 缺失或时钟漂移
// 导致负数时返回 null，上层不渲染。
function formatQaElapsed(startedAt: string | null, now: number): string | null {
  if (!startedAt) return null
  const startMs = Date.parse(startedAt)
  if (!Number.isFinite(startMs)) return null
  const elapsed = Math.floor((now - startMs) / 1000)
  if (elapsed < 0) return null
  const s = elapsed % 60
  const m = Math.floor(elapsed / 60) % 60
  const h = Math.floor(elapsed / 3600)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function QaSlot({
  mode,
  questions,
  answeredCount,
  now,
  qrSlot,
  password,
  siteHost,
}: {
  mode: ScreenModeState
  questions: ScreenQuestion[]
  answeredCount: number
  now: number
  qrSlot: React.ReactNode
  password: string
  siteHost: string
}) {
  const hostName = mode.qa_host_name ?? '嘉宾'
  // 已进行多久 — 大屏顺手提醒嘉宾和主办方时间。
  // qa_started_at 缺失（老数据 / startQa 之前的 QA 行）时不显示，避免 NaN。
  const elapsedLabel = formatQaElapsed(mode.qa_started_at, now)
  // 不维护本地 "已答" set —— 之前的乐观隐藏 set 只增不减，
  // 在「admin 撤销已答」或「外部回灌 answered_at=null」时无法重新出现，
  // 导致 q 永久从大屏消失。直接 trust DB 字段：fetchQuestionsForHost
  // 默认 .is('answered_at', null)，所以 questions 里有就该显示。
  // 点 ✓ 后由 server action → Realtime broadcast → 500ms 内 re-fetch
  // 自然让该条从 questions 移除；用户感知到的延迟可忽略。
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const top = questions.slice(0, 5)
  const ticker = questions.slice(5, 13)
  const [, startTransition] = useTransition()

  function markAnswered(id: number) {
    setErrorMsg(null)
    setPendingId(id)
    startTransition(async () => {
      const res = await setQuestionAnsweredAction(id, true)
      setPendingId((p) => (p === id ? null : p))
      if (res?.error) {
        setErrorMsg(`标记失败：${res.error}`)
        setTimeout(() => setErrorMsg((m) => (m === `标记失败：${res.error}` ? null : m)), 5000)
      }
    })
  }

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
        {/* 计时器单独一行做大 — 嘉宾和主办方都要在远处一眼看到当前 QA 已耗时，
            决定是否收尾。徽章里的小字号在投影上不够醒目。 */}
        {elapsedLabel && (
          <div className="text-center leading-none">
            <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300/70">已进行</p>
            <p className="mt-1 font-mono text-7xl font-bold tabular-nums text-rose-200">
              {elapsedLabel}
            </p>
          </div>
        )}
        <p className="text-center">
          <span className="block text-5xl font-semibold leading-tight text-white">{hostName}</span>
          {mode.qa_host_title && (
            <span className="mt-2 block text-xl text-zinc-300">{mode.qa_host_title}</span>
          )}
        </p>
        <div className="rounded-2xl bg-white p-4">{qrSlot}</div>
        <p className="text-center text-2xl font-semibold text-white">扫码向 {hostName} 提问</p>
        <JoinHint password={password} siteHost={siteHost} size="sm" />
      </div>

      {/* Right: 问题列表 */}
      <div className="flex h-full min-h-0 flex-col gap-4">
        <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">
          观众提问 · {questions.length} 待答
          {answeredCount > 0 && ` · ${answeredCount} 已答`} · 按点赞排序
        </p>
        {errorMsg && (
          <p className="rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/40">
            {errorMsg}
          </p>
        )}
        {questions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-2xl bg-zinc-900/40 ring-1 ring-zinc-800/60">
            {answeredCount > 0 ? (
              <p className="text-center text-2xl text-emerald-400">
                ✓ {answeredCount} 个问题都答完了
                <span className="mt-2 block text-base text-zinc-500">下一个问题，扫码 →</span>
              </p>
            ) : (
              <p className="text-2xl text-zinc-500">还没有人提问，扫码抢沙发 →</p>
            )}
          </div>
        ) : (
          <>
            <ul className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden">
              {top.map((q, i) => (
                <li
                  key={q.id}
                  className="group flex gap-4 rounded-2xl bg-zinc-900 px-6 py-4 ring-1 ring-zinc-800"
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
                  {/* admin 点选「这条已答」— /screen 已 admin-only，不会泄漏给观众。
                      hover 时显眼一点，平时低存在感避免投影时干扰观看。 */}
                  <button
                    type="button"
                    onClick={() => markAnswered(q.id)}
                    disabled={pendingId === q.id}
                    aria-label="标记已答"
                    title="标记已答"
                    className="shrink-0 self-start rounded-lg p-2 text-zinc-600 opacity-50 transition-all hover:bg-emerald-500/20 hover:text-emerald-300 hover:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                  >
                    <Check className="size-6" aria-hidden />
                  </button>
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
                    <li key={q.id} className="group flex items-center gap-2 truncate">
                      <span className="shrink-0 text-xs text-rose-400">❤{q.like_count}</span>
                      <span className="truncate">{q.body}</span>
                      <button
                        type="button"
                        onClick={() => markAnswered(q.id)}
                        disabled={pendingId === q.id}
                        aria-label="标记已答"
                        title="标记已答"
                        className="ml-auto shrink-0 rounded p-1 text-zinc-600 opacity-0 transition-all hover:bg-emerald-500/20 hover:text-emerald-300 group-hover:opacity-100 disabled:opacity-30"
                      >
                        <Check className="size-3.5" aria-hidden />
                      </button>
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
        <MatchCountdown size="lg" variant="dark" />
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
