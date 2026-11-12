'use client'

import { MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_SECTIONS } from '@/lib/meetup15/event'
import { mergeQuestions } from '@/lib/meetup15/discussion'
import type { ProjectionView } from '@/lib/meetup15/projection'
import { AdmissionScreen } from './AdmissionScreen'
import { OpeningDeck } from './OpeningDeck'
import { RaffleScreen } from './RaffleScreen'
import { useDiscussion, type DiscussionTransport } from './useDiscussion'
import { useRaffleResolution } from './useRaffleResolution'

const PRIORITY_QUESTION_COUNT = 3

export function ScreenContent({ data, compact = false }: { data: ProjectionView; compact?: boolean }) {
  if (data.mode === 'hidden') return null
  if (data.mode === 'opening') return <OpeningDeck compact={compact} />
  const liveQuestions = data.mode === 'qa' && data.round.closedAt === null
  const questions = data.mode !== 'qa' ? [] : liveQuestions
    ? data.questions.filter(question => !question.answered)
    : data.questions
  const total = data.mode === 'qa' ? data.questions.length : 0
  const answered = data.mode === 'qa' ? data.questions.filter(question => question.answered).length : 0
  const [frontQuestion, ...otherQuestions] = liveQuestions ? questions : []
  const nextQuestions = otherQuestions.slice(0, PRIORITY_QUESTION_COUNT - 1)
  const remainingQuestions = otherQuestions.slice(PRIORITY_QUESTION_COUNT - 1)
  const heading = compact ? 'text-lg' : 'text-3xl md:text-5xl'
  const screenWidth = data.mode === 'raffle' ? 'max-w-[96rem]' : 'max-w-6xl'
  return (
    <div className={compact ? 'w-full space-y-3 text-sm' : `mx-auto w-full ${screenWidth} space-y-6 text-lg`}>
      <p className={data.mode === 'qa' ? 'text-left text-sm font-semibold text-dams-blue' : 'font-medium text-dams-blue'}>{MEETUP_NAME}</p>
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
        <section aria-label="嘉宾问答" className={compact ? '@container space-y-3 text-left' : 'space-y-5 text-left'}>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-dams-selection pb-4">
            <h1 className={heading}>嘉宾问答 · {data.round.guest}</h1>
            <dl className="flex flex-wrap gap-2 text-center">
              {[['总问题', total], ['已答', answered], ['待答', total - answered]].map(([label, value]) => (
                <div key={label} className={label === '待答' ? 'rounded-lg bg-dams-hover px-3 py-2 text-white' : 'rounded-lg bg-white px-3 py-2'}>
                  <dt className="text-xs font-semibold">{label}</dt>
                  <dd className={compact ? 'text-xl font-bold tabular-nums' : 'text-3xl font-bold tabular-nums'}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-slate-600">
            第 {data.round.id} 轮 · {MEETUP_SECTIONS[data.round.section]}
            {data.round.closedAt !== null && ' · 历史回看'}
          </p>
          {frontQuestion ? (
            <div className={compact ? 'grid gap-3 @lg:grid-cols-[3fr_2fr]' : 'grid items-start gap-5 md:grid-cols-[3fr_2fr]'}>
              <div className="min-w-0 space-y-3">
                <article key={frontQuestion.id} aria-label="当前最高票问题"
                  className={compact ? 'rounded-xl bg-dams-hover p-4 text-white' : 'rounded-2xl bg-dams-hover px-6 py-5 text-white'}>
                  <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm font-semibold">
                    <span>当前最高票</span>
                    <span>{frontQuestion.likes} 个赞</span>
                  </div>
                  <p className={compact ? 'wrap-anywhere font-semibold' : 'wrap-anywhere text-2xl font-semibold leading-snug md:text-3xl'}>
                    {frontQuestion.body}
                  </p>
                </article>
                {nextQuestions.length > 0 && (
                  <ol aria-label="接下来" start={2} className="space-y-2">
                    {nextQuestions.map(question => (
                      <li key={question.id} className="flex items-start justify-between gap-3 rounded-xl border border-dams-selection bg-white px-4 py-3">
                        <p className={compact ? 'line-clamp-2 wrap-anywhere font-semibold' : 'line-clamp-2 wrap-anywhere text-xl font-semibold'}>{question.body}</p>
                        <span className="shrink-0 text-sm text-slate-600">{question.likes} 赞</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {remainingQuestions.length > 0 && (
                <aside className="min-w-0 rounded-xl bg-white/70 px-4 py-3">
                  <h2 className={compact ? 'mb-1 font-semibold' : 'mb-1 text-xl font-semibold'}>其余待答（{remainingQuestions.length}）</h2>
                  <ol aria-label="其余待答问题" start={4} tabIndex={0}
                    className={compact ? 'max-h-48 divide-y divide-dams-selection overflow-auto' : 'max-h-[53vh] divide-y divide-dams-selection overflow-auto'}>
                    {remainingQuestions.map(question => (
                      <li key={question.id} className="flex items-start justify-between gap-3 py-3">
                        <p className="line-clamp-2 wrap-anywhere">{question.body}</p>
                        <span className="shrink-0 text-sm text-slate-600">{question.likes} 赞</span>
                      </li>
                    ))}
                  </ol>
                </aside>
              )}
            </div>
          ) : questions.length ? (
            <ol aria-label="历史问题" tabIndex={0}
              className={compact ? 'max-h-44 space-y-2 overflow-auto rounded-xl' : 'max-h-[55vh] space-y-3 overflow-auto rounded-xl'}>
              {questions.map(question => (
                <li key={question.id} className="rounded-xl border border-dams-selection bg-white px-4 py-3">
                  <p className="whitespace-pre-wrap wrap-anywhere">{question.body}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {question.likes} 个赞 · {question.answered ? '已答' : '未答'}
                  </p>
                </li>
              ))}
            </ol>
          ) : <p className="text-slate-600">{total ? '本轮问题均已回答。' : '本轮还没有问题。'}</p>}
        </section>
      )}
      {data.mode === 'raffle' && <RaffleScreen data={data} compact={compact} />}
    </div>
  )
}

const projectionTransport: DiscussionTransport<ProjectionView> = {
  onQaPush(push, snapshot) {
    if (snapshot.mode !== 'qa' || snapshot.round.id !== push.roundId || snapshot.round.closedAt !== null) return
    if (snapshot.qaRevision !== undefined && push.revision <= snapshot.qaRevision) return
    if (push.baseRevision !== null && push.baseRevision !== snapshot.qaRevision) return null
    const base = push.baseRevision === null ? [] : snapshot.questions
    return { ...snapshot, qaRevision: push.revision, questions: mergeQuestions(base, push) }
  },
}

export function MeetupScreen() {
  const { data } = useDiscussion<ProjectionView>('/api/screen', 'projection', projectionTransport)
  const readyAt = data?.mode === 'raffle' && data.lottery?.phase === 'drawing' ? data.lottery.readyAt : null
  useRaffleResolution(readyAt)
  if (data?.mode === 'opening') {
    return <main><ScreenContent data={data} /></main>
  }
  const active = data && data.mode !== 'hidden'
  return (
    <main className={active
      ? `grid min-h-svh bg-dams-wash px-5 py-10 text-center text-slate-950 ${data.mode === 'qa' ? 'content-start' : 'content-center'}`
      : 'min-h-svh bg-black'}>
      {active && <ScreenContent data={data} />}
    </main>
  )
}
