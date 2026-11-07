'use client'

import type { FormEvent } from 'react'
import type { StaffSnapshot } from '@/lib/meetup15/discussion'
import { MEETUP_SECTIONS, type MeetupSection } from '@/lib/meetup15/event'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'

export function DiscussionAdmin() {
  const { data, error, pending, submit } = useDiscussion<StaffSnapshot>('/api/discussion/admin')
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在加载现场板块与问答…'}</p>
  const active = data.activeRound
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

  return (
    <section className="space-y-4 border-t border-zinc-200 pt-5">
      <h2 className="text-lg font-semibold">现场板块与嘉宾问答</h2>
      <p role="status" className="text-sm">当前板块 · {MEETUP_SECTIONS[data.currentSection]} · {data.override ? '手动' : '自动'}</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={discussionButton} disabled={pending || data.override === null}
          onClick={() => void submit({ action: 'section', section: null })}>恢复自动</button>
        {Object.entries(MEETUP_SECTIONS).map(([key, label]) => (
          <button key={key} className={discussionButton} disabled={pending} aria-pressed={data.override === key}
            onClick={() => void submit({ action: 'section', section: key as MeetupSection })}>{label}</button>
        ))}
      </div>
      <form onSubmit={openRound} className="space-y-2">
        <label htmlFor="discussion-guest" className="block text-sm">选择嘉宾</label>
          <select id="discussion-guest" name="guestId" required className={discussionInput} disabled={!hasGuests}>
            <option value="">请选择</option>
            {data.guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name}</option>)}
          </select>
        <button className={discussionButton} disabled={pending || !hasGuests}>开启新一轮问答</button>
        {active && <p className="text-xs text-zinc-600">开启新一轮会结束当前问答，问题仍可在历史轮次查看。</p>}
        {!hasGuests && <p className="text-xs text-zinc-600">请先配置嘉宾账号。</p>}
      </form>
      {active && (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
          <p className="font-medium">第 {active.id} 轮 · {active.guest} · {MEETUP_SECTIONS[active.section]}</p>
          <button className={discussionButton} disabled={pending}
            onClick={() => void submit({ action: 'end', roundId: active.id })}>结束本轮问答</button>
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
