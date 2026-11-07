'use client'

import { MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_SECTIONS } from '@/lib/meetup15/event'
import type { ProjectionView } from '@/lib/meetup15/projection'
import { AdmissionScreen } from './AdmissionScreen'
import { useDiscussion } from './useDiscussion'
import { useRaffleResolution } from './useRaffleResolution'

export function ScreenContent({ data, compact = false }: { data: ProjectionView; compact?: boolean }) {
  if (data.mode === 'hidden') return null
  const heading = compact ? 'text-lg' : 'text-3xl md:text-5xl'
  return (
    <div className={compact ? 'w-full space-y-3 text-sm' : 'mx-auto w-full max-w-6xl space-y-6 text-lg'}>
      <p className="font-medium text-teal-300">{MEETUP_NAME}</p>
      {data.mode === 'agenda' && (
        <section aria-label="议程展示" className={compact ? 'space-y-3' : 'space-y-5'}>
          <h1 className={heading}>活动议程</h1>
          <p className="text-zinc-300">{MEETUP_DATE}</p>
          <div className={compact ? 'space-y-4' : 'grid items-center gap-6 lg:grid-cols-[1fr_auto]'}>
            <ol className="space-y-1 text-left">
              {MEETUP_AGENDA.map((slot) => (
                <li key={slot.start} aria-current={slot.start === data.currentStart ? 'step' : undefined}
                  className={slot.start === data.currentStart ? 'rounded bg-teal-950 px-2 py-1 text-teal-200' : 'px-2 py-1'}>
                  <span className="mr-3 inline-block whitespace-nowrap tabular-nums">{slot.start}–{slot.end}</span>
                  {slot.title}
                </li>
              ))}
            </ol>
            <AdmissionScreen compact={compact} />
          </div>
        </section>
      )}
      {data.mode === 'qa' && (
        <section aria-label="嘉宾问答" className="space-y-3 text-left">
          <h1 className={heading}>嘉宾问答 · {data.round.guest}</h1>
          <p className="text-zinc-300">
            第 {data.round.id} 轮 · {MEETUP_SECTIONS[data.round.section]}
            {data.round.closedAt !== null && ' · 历史回看'}
          </p>
          {data.questions.length ? (
            <ol className={compact ? 'max-h-44 space-y-2 overflow-auto' : 'max-h-[55vh] space-y-3 overflow-auto'}>
              {data.questions.map((question) => (
                <li key={question.id} className="rounded-lg border border-zinc-700 px-3 py-2">
                  <p className="whitespace-pre-wrap break-words">{question.body}</p>
                  <p className="mt-1 text-xs text-zinc-300">{question.likes} 个赞 · {question.answered ? '已答' : '未答'}</p>
                </li>
              ))}
            </ol>
          ) : <p className="text-zinc-300">本轮还没有问题。</p>}
        </section>
      )}
      {data.mode === 'raffle' && (
        <section aria-label="现场抽奖" className="space-y-4">
          <h1 className={heading}>现场抽奖</h1>
          {data.lottery?.phase === 'winner' && <p className="break-words">恭喜 {data.lottery.winner}！</p>}
          {data.lottery?.phase === 'drawing' && (
            <p className="motion-safe:animate-pulse">抽奖进行中 · {data.lottery.candidateCount} 位候选人</p>
          )}
          {data.lottery?.phase === 'empty' && <p>本轮没有符合条件的候选人。</p>}
          {!data.lottery && <p>等待主持人开启抽奖</p>}
        </section>
      )}
    </div>
  )
}

export function MeetupScreen() {
  const { data } = useDiscussion<ProjectionView>('/api/screen', 'projection')
  const readyAt = data?.mode === 'raffle' && data.lottery?.phase === 'drawing' ? data.lottery.readyAt : null
  useRaffleResolution(readyAt)
  return data ? <ScreenContent data={data} /> : null
}
