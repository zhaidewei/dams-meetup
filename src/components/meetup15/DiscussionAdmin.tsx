'use client'

import { useState, type FormEvent } from 'react'
import { MAX_QA_TITLE, questionRoundTitle, type StaffSnapshot } from '@/lib/meetup15/discussion'
import { MEETUP_DISCUSSION_AGENDA, MEETUP_SECTIONS } from '@/lib/meetup15/event'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'

export function DiscussionAdmin() {
  const { data, error, pending, submit } = useDiscussion<StaffSnapshot>('/api/discussion/admin')
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在加载现场板块与问答…'}</p>
  const active = data.activeRound
  const closedRounds = data.rounds.filter(round => round.closedAt !== null)
  const currentSlot = MEETUP_DISCUSSION_AGENDA.find(slot => slot.start === data.currentAgendaStart)
  const agendaStart = selectedStart ?? currentSlot?.start ?? ''
  const slot = MEETUP_DISCUSSION_AGENDA.find(slot => slot.start === agendaStart)

  function openRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = new FormData(event.currentTarget).get('title')
    void submit({
      action: 'start', agendaStart: agendaStart || null, title: typeof title === 'string' ? title : undefined,
      activeRoundId: null, latestRoundId: data?.rounds[0]?.id ?? null,
    })
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
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!active && <form onSubmit={openRound} className="max-w-lg space-y-2">
        <label htmlFor="discussion-session" className="block text-sm">选择问答场次</label>
        <select id="discussion-session" value={agendaStart} className={discussionInput}
          onChange={event => setSelectedStart(event.target.value)} disabled={pending}>
          <option value="">临时问答</option>
          {MEETUP_DISCUSSION_AGENDA.map(slot => (
            <option key={slot.start} value={slot.start}>{slot.start}–{slot.end} · {slot.title}</option>
          ))}
        </select>
        {!agendaStart && (
          <div className="space-y-1">
            <label htmlFor="discussion-title" className="block text-sm">临时问答标题</label>
            <input id="discussion-title" name="title" required maxLength={MAX_QA_TITLE} className={discussionInput} />
          </div>
        )}
        <p className="text-sm text-slate-700">观众将在「{slot ? MEETUP_SECTIONS[slot.section] : '自由讨论区'}」提问。开启后，大屏会自动切到问答。</p>
        <button className="min-h-11 rounded-full bg-dams-blue px-4 text-sm font-semibold text-white hover:bg-dams-hover disabled:opacity-50"
          disabled={pending}>开启新一轮问答</button>
      </form>}
      {!active && closedRounds.length > 0 && (
        <form onSubmit={reopenRound} className="max-w-lg space-y-2 border-t border-dams-line pt-4">
          <label htmlFor="closed-qa-round" className="block text-sm font-semibold">重开已结束的问答</label>
          <select id="closed-qa-round" name="roundId" required className={discussionInput} disabled={pending}>
            <option value="">请选择轮次</option>
            {closedRounds.map(round => (
              <option key={round.id} value={round.id}>
                第 {round.id} 轮 · {questionRoundTitle(round)}
              </option>
            ))}
          </select>
          <p className="text-sm text-slate-700">保留本轮已有问题，在原板块继续收集提问。</p>
          <button type="submit" className={discussionButton} disabled={pending}>重开所选轮次</button>
        </form>
      )}
      {active && (
        <div className="space-y-3 rounded-xl border border-dams-selection bg-dams-wash p-3">
          <p className="font-medium">第 {active.id} 轮 · {questionRoundTitle(active)}</p>
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
