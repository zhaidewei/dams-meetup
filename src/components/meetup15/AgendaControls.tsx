'use client'

import type { StaffSnapshot } from '@/lib/meetup15/discussion'
import { MEETUP_AGENDA } from '@/lib/meetup15/event'
import { discussionButton } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'

export function AgendaControls() {
  const { data, error, pending, submit } = useDiscussion<StaffSnapshot>('/api/discussion/admin')
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || '正在加载议程…'}</p>

  return (
    <section aria-label="议程切换" className="space-y-3 border-t border-dams-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">议程切换</h3>
        <span role="status" className="text-sm text-slate-600">{data.override ? '手动切换' : '跟随议程'}</span>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button className={discussionButton} disabled={pending || data.override === null}
            onClick={() => void submit({ action: 'agenda', start: null })}>恢复自动</button>
          <button className={discussionButton} disabled={pending}
            aria-pressed={data.override === 'lounge' && data.agendaStartOverride === null}
            onClick={() => void submit({ action: 'section', section: 'lounge' })}>切到公共讨论区</button>
        </div>
        <div className="grid gap-2" role="group" aria-label="活动议程">
          {MEETUP_AGENDA.map(slot => (
            <button key={slot.start}
              className={discussionButton + ' flex flex-col items-start text-left aria-pressed:border-dams-blue aria-pressed:bg-dams-selection aria-pressed:text-dams-hover'}
              disabled={pending} aria-pressed={data.currentAgendaStart === slot.start}
              onClick={() => void submit({ action: 'agenda', start: slot.start })}>
              <span className="text-xs tabular-nums">{slot.start}–{slot.end}</span>
              <span className="font-semibold">{slot.title}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
