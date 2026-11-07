'use client'

import { useState } from 'react'
import { isMeetupSection, MEETUP_SECTIONS } from '@/lib/meetup15/event'
import type { PollAdminSnapshot, ScreenCommand } from '@/lib/meetup15/polls'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'

export function PollAdmin() {
  const { data, pending, error, submit } = useDiscussion<PollAdminSnapshot, ScreenCommand>('/api/polls/admin', 'both')
  const [selected, setSelected] = useState('')
  const reveal = data?.revealable.find((poll) => String(poll.id) === selected)
  const pinned = data?.revealed != null
  return (
    <section aria-label="大屏控制" className="space-y-3 rounded-xl border border-zinc-200 p-4">
      <h2 className="text-lg font-semibold">大屏控制</h2>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {data && (
        <>
          <p role="status">当前模式：{pinned ? '投票结果' : data.mode === 'intro' ? '开场介绍' : '现场互动'}</p>
          <div className="flex flex-wrap gap-2">
            <button className={discussionButton} disabled={pending || pinned || data.mode === 'intro'}
              onClick={() => void submit({ action: 'intro' })}>切到开场介绍</button>
            <button className={discussionButton} disabled={pending || (!pinned && data.mode === 'live')}
              onClick={() => void submit({ action: 'live' })}>返回现场互动</button>
          </div>
          <div>
            <label className="block text-sm" htmlFor="screen-poll-section">大屏投票板块</label>
            <select id="screen-poll-section" className={discussionInput} value={data.filter ?? ''} disabled={pending}
              onChange={(event) => {
                const section = event.target.value
                void submit({ action: 'filter', section: isMeetupSection(section) ? section : null })
              }}>
              <option value="">跟随当前讨论板块</option>
              {Object.entries(MEETUP_SECTIONS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm" htmlFor="screen-poll-reveal">已截止的隐藏投票</label>
            <select id="screen-poll-reveal" className={discussionInput} value={reveal ? selected : ''} disabled={pending || pinned}
              onChange={(event) => setSelected(event.target.value)}>
              <option value="">选择要揭晓的投票</option>
              {data.revealable.map((poll) => (
                <option key={poll.id} value={poll.id}>{poll.title} · {MEETUP_SECTIONS[poll.section]}</option>
              ))}
            </select>
          </div>
          <button className={discussionButton} disabled={pending || pinned || !reveal}
            onClick={() => reveal && void submit({ action: 'reveal', id: reveal.id })}>在大屏揭晓</button>
          {pinned && <p className="text-sm text-zinc-600">结果将留在大屏，直到点击「返回现场互动」。</p>}
        </>
      )}
    </section>
  )
}
