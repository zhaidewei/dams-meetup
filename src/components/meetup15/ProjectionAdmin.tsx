'use client'

import { useEffect, useRef, useState } from 'react'
import { MEETUP_SECTIONS } from '@/lib/meetup15/event'
import { OPENING_SLIDE_COUNT, PROJECTION_MODES, type ProjectionAdminSnapshot, type ProjectionCommand, type ProjectionMode,
  type ProjectionSelection } from '@/lib/meetup15/projection'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { RaffleControls } from './RaffleControls'
import { useDiscussion } from './useDiscussion'

const roundTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Europe/Amsterdam', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

const SCREEN_WIDTH = 1024
const SCREEN_HEIGHT = 768

function ScreenMirror() {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / SCREEN_WIDTH))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frame} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black ring-1 ring-dams-line">
      <iframe title="现场大屏实时镜像" src="/screen?mirror=1" tabIndex={-1}
        width={SCREEN_WIDTH} height={SCREEN_HEIGHT} className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ transform: `scale(${scale})` }} />
    </div>
  )
}

export function ProjectionAdmin() {
  const { data, error, pending, submit } = useDiscussion<ProjectionAdminSnapshot, ProjectionCommand>('/api/screen/admin', 'projection')
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在加载大屏控制…'}</p>

  const { revision, rounds, selection: current } = data
  const currentRoundId = current.mode === 'qa' ? current.roundId : undefined
  const currentRound = data.rounds.find((round) => round.id === currentRoundId)
  const currentRaffleId = current.mode === 'raffle' ? current.raffleId : undefined

  function show(selection: ProjectionSelection) {
    void submit({ ...selection, revision })
  }

  function choose(mode: ProjectionMode) {
    if (mode === current.mode) return
    if (mode === 'qa') {
      const round = rounds[0]
      if (round) show({ mode, roundId: round.id })
    } else if (mode === 'opening') {
      show({ mode, slide: 0 })
    } else {
      show({ mode })
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">大屏控制</h1>
        <p role="status" className="rounded-full bg-dams-wash px-3 py-1 text-sm text-dams-hover">
          {current.mode === 'hidden' ? '大屏状态 · 已隐藏' : `正在投屏 · ${PROJECTION_MODES[current.mode]}`}
          {currentRound && ` · ${currentRound.guest}${currentRound.closedAt !== null ? '（回看）' : ''}`}
          {current.mode === 'raffle' && (currentRaffleId ? ` · 第 ${currentRaffleId} 轮（回看）` : ' · 跟随最新一轮')}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
        <section className="min-w-0 space-y-3 rounded-xl border border-dams-line p-4">
          <h2 className="font-semibold">选择画面</h2>
          <div role="group" aria-label="大屏画面" className="flex flex-wrap gap-2">
            {(Object.keys(PROJECTION_MODES) as ProjectionMode[]).map((mode) => (
              <button key={mode} type="button" disabled={pending || (mode === 'qa' && !data.rounds.length)}
                className={`${discussionButton} aria-pressed:border-dams-blue aria-pressed:bg-dams-wash aria-pressed:text-dams-hover`}
                aria-pressed={current.mode === mode} onClick={() => choose(mode)}>{PROJECTION_MODES[mode]}</button>
            ))}
          </div>
          {current.mode === 'raffle' && (
            <div className="space-y-3 border-t border-dams-line pt-3">
              <div className="space-y-1">
                <label htmlFor="raffle-round" className="block text-sm">选择抽奖轮次</label>
                <select id="raffle-round" className={discussionInput} value={currentRaffleId ?? ''}
                  disabled={pending} onChange={(event) => show({ mode: 'raffle', raffleId: event.target.value ? Number(event.target.value) : undefined })}>
                  <option value="">跟随最新一轮</option>
                  {data.raffleRounds.map(round => (
                    <option key={round.id} value={round.id}>
                      第 {round.id} 轮 · {round.winner ?? '无中奖者'} · {roundTime.format(round.finishedAt)}
                    </option>
                  ))}
                </select>
              </div>
              {currentRaffleId === undefined && <RaffleControls />}
            </div>
          )}
          {current.mode === 'qa' && (
            <div className="space-y-1 border-t border-dams-line pt-3">
              <label htmlFor="projection-round" className="block text-sm">选择问答轮次</label>
              <select id="projection-round" className={discussionInput} value={current.roundId}
                disabled={pending || !data.rounds.length} onChange={(event) =>
                  show({ mode: 'qa', roundId: Number(event.target.value) })}>
                {data.rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.closedAt === null ? '进行中' : '已结束'} · {round.guest} · {MEETUP_SECTIONS[round.section]} · {roundTime.format(round.openedAt * 1000)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>
        <section className="min-w-0 space-y-3 rounded-xl border border-dams-line p-4" aria-label="现场大屏镜像">
          <h2 className="font-semibold">现场大屏镜像</h2>
          <ScreenMirror />
          {current.mode === 'opening' && (
            <div className="flex items-center justify-between gap-2">
              <button type="button" className={discussionButton} disabled={pending || current.slide === 0}
                onClick={() => show({ mode: 'opening', slide: current.slide - 1 })}>上一页</button>
              <span role="status" className="text-sm tabular-nums">{current.slide + 1} / {OPENING_SLIDE_COUNT}</span>
              <button type="button" className={discussionButton} disabled={pending || current.slide >= OPENING_SLIDE_COUNT - 1}
                onClick={() => show({ mode: 'opening', slide: current.slide + 1 })}>下一页</button>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
