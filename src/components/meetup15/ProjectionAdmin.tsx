'use client'

import type { Dispatch, SetStateAction } from 'react'
import { MEETUP_SECTIONS } from '@/lib/meetup15/event'
import { PROJECTION_MODES, type ProjectionAdminSnapshot, type ProjectionCommand, type ProjectionMode,
  type ProjectionSelection, type ProjectionView } from '@/lib/meetup15/projection'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { ScreenContent } from './MeetupScreen'
import { RaffleControls } from './RaffleControls'
import { useDiscussion } from './useDiscussion'

type Draft = { mode: ProjectionMode; roundId?: number; raffleId?: number }
export type VersionedDraft = Draft & { baseRevision: number }

const roundTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Europe/Amsterdam', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function DraftPreview({ draft, changed, stale, pending, onConfirm }: {
  draft: Draft
  changed: boolean
  stale: boolean
  pending: boolean
  onConfirm: (selection: ProjectionSelection) => void
}) {
  const selection: ProjectionSelection | null = draft.mode === 'qa'
    ? draft.roundId ? { mode: 'qa', roundId: draft.roundId } : null
    : draft.mode === 'raffle' ? { mode: 'raffle', raffleId: draft.raffleId } : { mode: draft.mode }
  const query = new URLSearchParams({ mode: selection?.mode ?? 'hidden' })
  if (selection?.mode === 'qa') query.set('roundId', String(selection.roundId))
  if (selection?.mode === 'raffle' && selection.raffleId !== undefined) query.set('raffleId', String(selection.raffleId))
  const { data, error } = useDiscussion<ProjectionView>(`/api/screen/preview?${query}`, 'projection')
  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-dams-line p-4" aria-label="画面预览">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">画面预览</h2>
        <p role="status" className="text-sm text-zinc-600">
          {stale ? '大屏状态已变化，请重新选择画面或轮次。'
            : !selection ? '待选择问答轮次' : changed ? `待切换 · ${PROJECTION_MODES[draft.mode]}` : '与当前画面一致'}
        </p>
      </div>
      <div className="relative aspect-[4/3] w-full">
        <section key={query.toString()} aria-label="仅管理员可见的画面预览" tabIndex={0}
          className={'absolute inset-0 flex flex-col overflow-auto rounded-lg p-4 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dams-blue ' +
            (data && data.mode !== 'hidden' ? 'bg-white text-dams-ink' : 'bg-black text-zinc-100')}>
          <div className="my-auto w-full shrink-0">
            {!selection ? <p>请选择要投屏的问答轮次</p> : error
              ? <p role="alert">{error}</p> : data
                ? <ScreenContent data={data} compact /> : <p>正在加载预览…</p>}
          </div>
        </section>
      </div>
      <div className="flex justify-end">
        <button type="button" className="min-h-11 rounded-md bg-dams-hover px-4 py-2 text-white disabled:opacity-50"
          disabled={pending || stale || !changed || !selection || !data || Boolean(error)}
          onClick={() => selection && onConfirm(selection)}>确认切换</button>
      </div>
    </section>
  )
}

export function ProjectionAdmin({ draft, setDraft }: {
  draft: VersionedDraft | null
  setDraft: Dispatch<SetStateAction<VersionedDraft | null>>
}) {
  const { data, error, pending, submit } = useDiscussion<ProjectionAdminSnapshot, ProjectionCommand>('/api/screen/admin', 'projection')
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在加载大屏控制…'}</p>

  const current = data.selection
  const currentRoundId = current.mode === 'qa' ? current.roundId : undefined
  const currentRound = data.rounds.find((round) => round.id === currentRoundId)
  const activeRound = data.rounds.find((round) => round.closedAt === null)
  const selected = draft ?? current
  const selectedRoundId = selected.mode === 'qa' ? selected.roundId : undefined
  const currentRaffleId = current.mode === 'raffle' ? current.raffleId : undefined
  const selectedRaffleId = selected.mode === 'raffle' ? selected.raffleId : undefined
  const changed = selected.mode !== current.mode || selectedRoundId !== currentRoundId || selectedRaffleId !== currentRaffleId
  const revision = data.revision
  const stale = draft !== null && draft.baseRevision !== revision

  function choose(mode: ProjectionMode) {
    if (mode === selected.mode && !stale) return
    setDraft({
      mode,
      roundId: mode === 'qa' ? selectedRoundId ?? currentRoundId ?? activeRound?.id : undefined,
      raffleId: mode === 'raffle' ? selectedRaffleId : undefined,
      baseRevision: revision,
    })
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
              <button key={mode} type="button" disabled={pending}
                className={`${discussionButton} aria-pressed:border-dams-blue aria-pressed:bg-dams-wash aria-pressed:text-dams-hover`}
                aria-pressed={selected.mode === mode} onClick={() => choose(mode)}>{PROJECTION_MODES[mode]}</button>
            ))}
          </div>
          {selected.mode === 'raffle' && (
            <div className="space-y-3 border-t border-dams-line pt-3">
              <div className="space-y-1">
                <label htmlFor="raffle-round" className="block text-sm">选择抽奖轮次</label>
                <select id="raffle-round" className={discussionInput} value={selectedRaffleId ?? ''}
                  disabled={pending} onChange={(event) => setDraft({
                    mode: 'raffle', raffleId: event.target.value ? Number(event.target.value) : undefined, baseRevision: revision,
                  })}>
                  <option value="">跟随最新一轮</option>
                  {data.raffleRounds.map(round => (
                    <option key={round.id} value={round.id}>
                      第 {round.id} 轮 · {round.winner ?? '无中奖者'} · {roundTime.format(round.finishedAt)}
                    </option>
                  ))}
                </select>
              </div>
              {selectedRaffleId === undefined && current.mode === 'raffle' && currentRaffleId === undefined && <RaffleControls />}
              {selectedRaffleId === undefined && currentRaffleId !== undefined &&
                <p className="text-sm text-zinc-600">确认切回最新一轮后即可开始抽奖。</p>}
            </div>
          )}
          {selected.mode === 'qa' && (
            <div className="space-y-1 border-t border-dams-line pt-3">
              <label htmlFor="projection-round" className="block text-sm">选择问答轮次</label>
              <select id="projection-round" className={discussionInput} value={selected.roundId ?? ''}
                disabled={pending || !data.rounds.length} onChange={(event) =>
                  setDraft({ mode: 'qa', roundId: Number(event.target.value), baseRevision: revision })}>
                <option value="" disabled>{data.rounds.length ? '请选择一轮' : '暂无问答轮次'}</option>
                {data.rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.closedAt === null ? '进行中' : '已结束'} · {round.guest} · {MEETUP_SECTIONS[round.section]} · {roundTime.format(round.openedAt * 1000)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>
        <DraftPreview key={draft?.baseRevision ?? revision} draft={selected} changed={changed} stale={stale} pending={pending}
          onConfirm={async (selection) => {
            if (draft && !stale && await submit({ ...selection, revision: draft.baseRevision })) {
              setDraft((latest) => latest === draft ? null : latest)
            }
          }} />
      </div>
    </section>
  )
}
