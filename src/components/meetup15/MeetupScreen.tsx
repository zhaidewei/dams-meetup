'use client'

import { MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_SECTIONS } from '@/lib/meetup15/event'
import type { ProjectionView } from '@/lib/meetup15/projection'
import { AdmissionScreen } from './AdmissionScreen'
import { RaffleScreen } from './RaffleScreen'
import { useDiscussion } from './useDiscussion'
import { useRaffleResolution } from './useRaffleResolution'

export function ScreenContent({ data, compact = false }: { data: ProjectionView; compact?: boolean }) {
  if (data.mode === 'hidden') return null
  const questions = data.mode !== 'qa' ? [] : data.round.closedAt === null
    ? data.questions.filter(question => !question.answered).slice(0, 3)
    : data.questions
  const heading = compact ? 'text-lg' : 'text-3xl md:text-5xl'
  const screenWidth = data.mode === 'raffle' ? 'max-w-[96rem]' : 'max-w-6xl'
  return (
    <div className={compact ? 'w-full space-y-3 text-sm' : `mx-auto w-full ${screenWidth} space-y-6 text-lg`}>
      <p className="font-medium text-dams-blue">{MEETUP_NAME}</p>
      {data.mode === 'agenda' && (
        <section aria-label="议程展示" className={compact ? 'space-y-3' : 'space-y-5'}>
          <h1 className={heading}>活动议程</h1>
          <p className="text-slate-600">{MEETUP_DATE}</p>
          <div className={compact ? 'space-y-4' : 'grid items-center gap-6 lg:grid-cols-[1fr_auto]'}>
            <ol className="space-y-1 text-left">
              {MEETUP_AGENDA.map((slot) => (
                <li key={slot.start} aria-current={slot.start === data.currentStart ? 'step' : undefined}
                  className={slot.start === data.currentStart ? 'rounded-lg bg-dams-selection px-3 py-2 font-semibold text-dams-hover' : 'px-2 py-1'}>
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
          <p className="text-slate-600">
            第 {data.round.id} 轮 · {MEETUP_SECTIONS[data.round.section]}
            {data.round.closedAt !== null && ' · 历史回看'}
          </p>
          {questions.length ? (
            <ol className={compact ? 'max-h-44 space-y-2 overflow-auto' : 'max-h-[55vh] space-y-3 overflow-auto'}>
              {questions.map((question) => (
                <li key={question.id} className="rounded-xl border border-dams-selection bg-white px-4 py-3">
                  <p className={compact ? "whitespace-pre-wrap break-words" : "whitespace-pre-wrap break-words text-xl font-semibold leading-snug md:text-3xl"}>{question.body}</p>
                  <p className={compact ? "mt-1 text-xs text-slate-600" : "mt-2 text-base font-semibold text-slate-700 md:text-xl"}>{question.likes} 个赞 · {question.answered ? '已答' : '未答'}</p>
                </li>
              ))}
            </ol>
          ) : <p className="text-slate-600">{data.questions.length ? '本轮问题均已回答。' : '本轮还没有问题。'}</p>}
        </section>
      )}
      {data.mode === 'raffle' && <RaffleScreen data={data} compact={compact} />}
    </div>
  )
}

export function MeetupScreen() {
  const { data } = useDiscussion<ProjectionView>('/api/screen', 'projection')
  const readyAt = data?.mode === 'raffle' && data.lottery?.phase === 'drawing' ? data.lottery.readyAt : null
  useRaffleResolution(readyAt)
  const active = data && data.mode !== 'hidden'
  return (
    <main className={active
      ? 'grid min-h-svh content-center bg-dams-wash px-5 py-10 text-center text-slate-950'
      : 'min-h-svh bg-black'}>
      {active && <ScreenContent data={data} />}
    </main>
  )
}
