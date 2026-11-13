'use client'

import type { FormEvent } from 'react'
import type { StaffSnapshot } from '@/lib/meetup15/discussion'
import { MEETUP_SECTIONS } from '@/lib/meetup15/event'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'

export function DiscussionAdmin() {
  const { data, error, pending, submit } = useDiscussion<StaffSnapshot>('/api/discussion/admin')
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在加载现场板块与问答…'}</p>
  const active = data.activeRound
  const closedRounds = data.rounds.filter(round => round.closedAt !== null)
  const hasGuests = data.guests.length > 0

  function openRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const guestId = new FormData(event.currentTarget).get('guestId')
    if (typeof guestId === 'string' && guestId) {
      void submit({
        action: 'start', guestId, activeRoundId: active?.id ?? null, latestRoundId: data?.rounds[0]?.id ?? null,
      })
    }
  }

  function reopenRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const roundId = Number(new FormData(event.currentTarget).get('roundId'))
    const round = closedRounds.find(round => round.id === roundId)
    if (round?.closedAt != null) void submit({ action: 'reopen', roundId, generation: round.generation })
  }

  return (
    <section aria-label="问答管理" className="space-y-4 border-t border-dams-line pt-4">
      <h3 className="font-semibold">管理问答</h3>
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-dams-selection bg-dams-wash p-4">
        <p className="font-semibold">当前板块 · {MEETUP_SECTIONS[data.currentSection]}</p>
        <span className="rounded-full bg-white px-3 py-1 text-sm text-dams-hover">{data.override ? '手动切换' : '跟随议程'}</span>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!active && <form onSubmit={openRound} className="max-w-lg space-y-2">
        <label htmlFor="discussion-guest" className="block text-sm">选择嘉宾</label>
          <select id="discussion-guest" name="guestId" required className={discussionInput} disabled={!hasGuests}>
            <option value="">请选择</option>
            {data.guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name}</option>)}
          </select>
        <p className="text-sm text-slate-700">观众将在「{MEETUP_SECTIONS[data.currentSection]}」提问。开启后，大屏会自动切到问答。</p>
        <button className="min-h-11 rounded-full bg-dams-blue px-4 text-sm font-semibold text-white hover:bg-dams-hover disabled:opacity-50"
          disabled={pending || !hasGuests}>开启新一轮问答</button>
        {!hasGuests && <p className="text-xs text-zinc-600">请先配置嘉宾账号。</p>}
      </form>}
      {!active && closedRounds.length > 0 && (
        <form onSubmit={reopenRound} className="max-w-lg space-y-2 border-t border-dams-line pt-4">
          <label htmlFor="closed-qa-round" className="block text-sm font-semibold">重开已结束的问答</label>
          <select id="closed-qa-round" name="roundId" required className={discussionInput} disabled={pending}>
            <option value="">请选择轮次</option>
            {closedRounds.map(round => (
              <option key={round.id} value={round.id}>
                第 {round.id} 轮 · {round.guest} · {MEETUP_SECTIONS[round.section]}
              </option>
            ))}
          </select>
          <p className="text-sm text-slate-700">保留本轮已有问题，在原板块继续收集提问。</p>
          <button type="submit" className={discussionButton} disabled={pending}>重开所选轮次</button>
        </form>
      )}
      {active && (
        <div className="space-y-3 rounded-xl border border-dams-selection bg-dams-wash p-3">
          <p className="font-medium">第 {active.id} 轮 · {active.guest} · {MEETUP_SECTIONS[active.section]}</p>
          <p className="text-sm text-dams-hover">手机端接受提问</p>
          <button className={discussionButton} disabled={pending}
            onClick={() => void submit({ action: 'end', roundId: active.id, generation: active.generation })}>结束本轮问答</button>
          {data.questions.length ? (
            <ol className="space-y-2">
              {data.questions.map((question) => (
                <li key={question.id} className="space-y-1 rounded bg-white p-2">
                  <p className="whitespace-pre-wrap break-words">{question.body}</p>
                  <p className="text-xs">{question.author} · {question.likes} 个赞 · {question.answered ? '已答' : '未答'}</p>
                  <button className={discussionButton} disabled={pending}
                    onClick={() => void submit({ action: 'answer', id: question.id, answered: !question.answered })}>
                    {question.answered ? '撤销已答' : '标记已答'}
                  </button>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm">本轮还没有问题。</p>}
        </div>
      )}
    </section>
  )
}
