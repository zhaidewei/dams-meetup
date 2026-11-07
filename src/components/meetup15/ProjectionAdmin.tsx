'use client'

import type { Dispatch, SetStateAction } from 'react'
import { MEETUP_SECTIONS } from '@/lib/meetup15/event'
import { PROJECTION_MODES, type ProjectionAdminSnapshot, type ProjectionCommand, type ProjectionMode,
  type ProjectionSelection, type ProjectionView } from '@/lib/meetup15/projection'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { ScreenContent } from './MeetupScreen'
import { useDiscussion } from './useDiscussion'

type Draft = { mode: ProjectionMode; roundId?: number }
export type VersionedDraft = Draft & { baseRevision: number }

const roundTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Europe/Amsterdam', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function DraftPreview({ draft, changed, stale, pending, onReset, onConfirm }: {
  draft: Draft
  changed: boolean
  stale: boolean
  pending: boolean
  onReset: () => void
  onConfirm: (selection: ProjectionSelection) => void
}) {
  const selection = draft.mode === 'qa'
    ? draft.roundId ? { mode: 'qa' as const, roundId: draft.roundId } : null
    : { mode: draft.mode }
  const query = new URLSearchParams({ mode: selection?.mode ?? 'hidden' })
  if (selection?.mode === 'qa') query.set('roundId', String(selection.roundId))
  const { data, error } = useDiscussion<ProjectionView>(`/api/screen/preview?${query}`, 'projection')
  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-zinc-200 p-4" aria-label="画面预览">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">画面预览</h2>
        <p role="status" className="text-sm text-zinc-600">
          {stale ? '大屏状态已变化，请重新选择画面或轮次。'
            : !selection ? '待选择问答轮次' : changed ? `待切换 · ${PROJECTION_MODES[draft.mode]}` : '与当前画面一致'}
        </p>
      </div>
      <div aria-label="仅管理员可见的画面预览" className="grid min-h-48 min-w-0 content-center rounded-lg bg-black p-4 text-center text-zinc-100">
        {!selection ? <p>请选择要投屏的问答轮次</p> : error
          ? <p role="alert">{error}</p> : data
            ? <ScreenContent data={data} compact /> : <p>正在加载预览…</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={discussionButton} disabled={pending || (!changed && !stale)} onClick={onReset}>放弃修改</button>
        <button type="button" className="rounded-md bg-teal-800 px-4 py-2 text-white disabled:opacity-50"
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
  const changed = selected.mode !== current.mode || selectedRoundId !== currentRoundId
  const revision = data.revision
  const stale = draft !== null && draft.baseRevision !== revision

  function choose(mode: ProjectionMode) {
    if (mode === selected.mode && !stale) return
    setDraft({
      mode,
      roundId: mode === 'qa' ? selectedRoundId ?? currentRoundId ?? activeRound?.id : undefined,
      baseRevision: revision,
    })
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">大屏控制</h1>
        <p role="status" className="rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-900">
          {current.mode === 'hidden' ? '大屏状态 · 已隐藏' : `正在投屏 · ${PROJECTION_MODES[current.mode]}`}
          {currentRound && ` · ${currentRound.guest}${currentRound.closedAt !== null ? '（回看）' : ''}`}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
        <section className="min-w-0 space-y-3 rounded-xl border border-zinc-200 p-4">
          <h2 className="font-semibold">选择画面</h2>
          <div role="group" aria-label="大屏画面" className="flex flex-wrap gap-2">
            {(Object.keys(PROJECTION_MODES) as ProjectionMode[]).map((mode) => (
              <button key={mode} type="button" disabled={pending}
                className={`${discussionButton} aria-pressed:border-teal-700 aria-pressed:bg-teal-50 aria-pressed:text-teal-900`}
                aria-pressed={selected.mode === mode} onClick={() => choose(mode)}>{PROJECTION_MODES[mode]}</button>
            ))}
          </div>
          {selected.mode === 'qa' && (
            <div className="space-y-1 border-t border-zinc-200 pt-3">
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
          onReset={() => setDraft(null)}
          onConfirm={async (selection) => {
            if (draft && !stale && await submit({ ...selection, revision: draft.baseRevision })) {
              setDraft((latest) => latest === draft ? null : latest)
            }
          }} />
      </div>
    </section>
  )
}
