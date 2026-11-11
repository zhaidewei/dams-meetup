'use client'

import { MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_SECTIONS } from '@/lib/meetup15/event'
import type { ProjectionView } from '@/lib/meetup15/projection'
import { AdmissionScreen } from './AdmissionScreen'
import { RaffleScreen } from './RaffleScreen'
import { useDiscussion } from './useDiscussion'
import { useRaffleResolution } from './useRaffleResolution'

const PRIORITY_QUESTION_COUNT = 3

export function ScreenContent({ data }: { data: ProjectionView }) {
  if (data.mode === 'hidden') return null
  const liveQuestions = data.mode === 'qa' && data.round.closedAt === null
  const questions = data.mode !== 'qa' ? [] : liveQuestions
    ? data.questions.filter(question => !question.answered)
    : data.questions
  const total = data.mode === 'qa' ? data.questions.length : 0
  const answered = data.mode === 'qa' ? data.questions.filter(question => question.answered).length : 0
  const [frontQuestion, ...otherQuestions] = liveQuestions ? questions : []
  const nextQuestions = otherQuestions.slice(0, PRIORITY_QUESTION_COUNT - 1)
  const remainingQuestions = otherQuestions.slice(PRIORITY_QUESTION_COUNT - 1)
  return (
    <div className="projection-content">
      <p className="projection-eyebrow">{MEETUP_NAME}</p>
      {data.mode === 'agenda' && (
        <section aria-label="议程展示" className="projection-agenda">
          <h1 className="projection-title">活动议程</h1>
          <p className="projection-meta">{MEETUP_DATE}</p>
          <div className="projection-agenda-grid">
            <ol className="projection-agenda-list">
              {MEETUP_AGENDA.map((slot) => (
                <li key={slot.start} aria-current={slot.start === data.currentStart ? 'step' : undefined}
                  className="projection-slot">
                  <span className="whitespace-nowrap font-semibold tabular-nums text-dams-hover">{slot.start}–{slot.end}</span>
                  <span>{slot.title}</span>
                </li>
              ))}
            </ol>
            <div className="projection-entry"><AdmissionScreen projection /></div>
          </div>
        </section>
      )}
      {data.mode === 'qa' && (
        <section aria-label="嘉宾问答" className="projection-qa">
          <div className="projection-qa-header">
            <div className="min-w-0">
              <h1 className="projection-title wrap-anywhere">嘉宾问答 · {data.round.guest}</h1>
              <p className="projection-meta">
                第 {data.round.id} 轮 · {MEETUP_SECTIONS[data.round.section]}
                {data.round.closedAt !== null && ' · 历史回看'}
              </p>
            </div>
            <dl className="projection-counts">
              {[['总问题', total], ['已答', answered], ['待答', total - answered]].map(([label, value]) => (
                <div key={label} className={label === '待答' ? 'bg-dams-hover text-white' : 'bg-white'}>
                  <dt>{label}</dt>
                  <dd className="font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {frontQuestion ? (
            <div className="projection-question-grid">
              <div className="projection-priority min-w-0">
                <article key={frontQuestion.id} aria-label="当前最高票问题"
                  className="projection-lead bg-dams-hover text-white">
                  <div className="projection-lead-label">
                    <span>当前最高票</span>
                    <span>{frontQuestion.likes} 个赞</span>
                  </div>
                  <p className="projection-lead-body wrap-anywhere font-semibold">
                    {frontQuestion.body}
                  </p>
                </article>
                {nextQuestions.length > 0 && (
                  <ol aria-label="接下来" start={2} className="projection-next">
                    {nextQuestions.map(question => (
                      <li key={question.id} className="projection-next-item border border-dams-selection bg-white">
                        <p className="line-clamp-2 wrap-anywhere font-semibold">{question.body}</p>
                        <span className="projection-votes shrink-0 text-slate-600">{question.likes} 赞</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {remainingQuestions.length > 0 && (
                <aside className="projection-queue min-w-0 bg-white/80">
                  <h2 className="projection-queue-title font-semibold">其余待答（{remainingQuestions.length}）</h2>
                  <ol aria-label="其余待答问题" start={4} tabIndex={0}
                    className="projection-queue-list divide-y divide-dams-selection">
                    {remainingQuestions.map(question => (
                      <li key={question.id} className="projection-queue-item">
                        <p className="line-clamp-2 wrap-anywhere">{question.body}</p>
                        <span className="projection-votes shrink-0 text-slate-600">{question.likes} 赞</span>
                      </li>
                    ))}
                  </ol>
                </aside>
              )}
            </div>
          ) : questions.length ? (
            <ol aria-label="历史问题" tabIndex={0}
              className="projection-history">
              {questions.map(question => (
                <li key={question.id} className="projection-history-item border border-dams-selection bg-white">
                  <p className="whitespace-pre-wrap wrap-anywhere">{question.body}</p>
                  <p className="projection-votes text-slate-600">
                    {question.likes} 个赞 · {question.answered ? '已答' : '未答'}
                  </p>
                </li>
              ))}
            </ol>
          ) : <p className="text-slate-600">{total ? '本轮问题均已回答。' : '本轮还没有问题。'}</p>}
        </section>
      )}
      {data.mode === 'raffle' && <RaffleScreen data={data} />}
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
      ? 'grid min-h-svh justify-items-center bg-dams-wash text-slate-950'
      : 'min-h-svh bg-black'}>
      {active && <div className="projection-stage projection-stage-live"><ScreenContent data={data} /></div>}
    </main>
  )
}
