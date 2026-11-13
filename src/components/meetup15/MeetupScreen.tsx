'use client'

import Image from 'next/image'
import { useEffect } from 'react'
import { MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_SECTIONS } from '@/lib/meetup15/event'
import { mergeQuestions } from '@/lib/meetup15/discussion'
import { OPENING_SLIDE_COUNT, type ProjectionCommand, type ProjectionView } from '@/lib/meetup15/projection'
import { AdmissionScreen } from './AdmissionScreen'
import { OpeningDeck } from './OpeningDeck'
import { RaffleScreen } from './RaffleScreen'
import { useDiscussion, type DiscussionTransport } from './useDiscussion'
import { useRaffleResolution } from './useRaffleResolution'

const PRIORITY_QUESTION_COUNT = 3

function ScreenContent({ data, mirror }: { data: ProjectionView; mirror: boolean }) {
  if (data.mode === 'hidden') return null
  if (data.mode === 'opening') return <OpeningDeck index={data.slide} />
  if (data.mode === 'raffle') return <RaffleScreen data={data} muted={mirror} />
  const liveQuestions = data.mode === 'qa' && data.round.closedAt === null
  const questions = data.mode !== 'qa' ? [] : liveQuestions
    ? data.questions.filter(question => !question.answered)
    : data.questions
  const total = data.mode === 'qa' ? data.questions.length : 0
  const answered = data.mode === 'qa' ? data.questions.filter(question => question.answered).length : 0
  const [frontQuestion, ...otherQuestions] = liveQuestions ? questions : []
  const nextQuestions = otherQuestions.slice(0, PRIORITY_QUESTION_COUNT - 1)
  const remainingQuestions = otherQuestions.slice(PRIORITY_QUESTION_COUNT - 1)
  const heading = data.mode === 'qa'
    ? 'text-3xl md:text-5xl [@media(max-height:650px)]:md:text-3xl'
    : 'text-3xl md:text-5xl'
  return (
    <div className={`mx-auto w-full max-w-6xl space-y-6 text-lg ${data.mode === 'qa' ? '[@media(max-height:650px)]:space-y-3' : ''}`}>
      <p className={data.mode === 'qa' ? 'text-left text-sm font-semibold text-dams-blue' : 'font-medium text-dams-blue'}>{MEETUP_NAME}</p>
      {data.mode === 'agenda' && (
        <section aria-label="议程展示" className="space-y-5">
          <h1 className={`${heading} font-bold text-dams-blue`}>活动议程</h1>
          <p className="text-slate-600">{MEETUP_DATE}</p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-8">
            <ol className="col-span-2 space-y-1 text-left mb-2 md:col-span-1 md:col-start-2 md:row-span-3 md:row-start-1 md:mb-0 md:self-center md:text-base lg:text-lg">
              {MEETUP_AGENDA.map((slot) => (
                <li key={slot.start} aria-current={slot.start === data.currentStart ? 'step' : undefined}
                  className={slot.start === data.currentStart ? 'rounded-lg bg-dams-selection px-3 py-2 font-semibold text-dams-hover' : 'px-2 py-1'}>
                  <span className="mr-3 inline-block whitespace-nowrap tabular-nums">{slot.start}–{slot.end}</span>
                  {slot.title}
                </li>
              ))}
            </ol>
            <section className="col-start-1 row-span-3 grid min-w-0 grid-rows-subgrid rounded-xl border border-dams-line bg-white p-2 sm:p-3 md:row-start-1">
              <header className="space-y-1">
                <h2 className="text-base font-semibold text-dams-blue">活动平台入场</h2>
                <p className="wrap-anywhere text-sm text-dams-hover">live.nl-dams.com</p>
              </header>
              <AdmissionScreen agenda />
            </section>
            <section className="row-span-3 grid min-w-0 grid-rows-subgrid rounded-xl border border-dams-line bg-white p-2 sm:p-3 col-start-2 md:col-start-3 md:row-start-1">
              <header className="space-y-1">
                <h2 className="text-base font-semibold text-dams-blue">微信活动群</h2>
                <p className="text-sm text-slate-700">微信扫码加入活动二群</p>
              </header>
              <Image src="/meetup15-wechat-group.png" alt="荷兰数据社群 Meetup 活动二群二维码"
                width={732} height={732} unoptimized className="mx-auto h-auto w-full max-w-48 self-center" />
              <div className="space-y-1">
                <p className="text-sm text-slate-700">社群微信群采用实名邀请</p>
                <p className="text-xs text-slate-600">群码 11 月 20 日前有效</p>
              </div>
            </section>
          </div>
        </section>
      )}
      {data.mode === 'qa' && (
        <section aria-label="嘉宾问答" className="space-y-5 text-left [@media(max-height:650px)]:space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-dams-selection pb-4">
            <h1 className={`${heading} font-bold text-dams-blue`}>嘉宾问答 · {data.round.guest}</h1>
            <dl className="flex flex-wrap gap-2 text-center">
              {[['总问题', total], ['已答', answered], ['待答', total - answered]].map(([label, value]) => (
                <div key={label} className={`rounded-lg px-3 py-2 ${label === '待答' ? 'bg-dams-orange text-dams-ink' : 'bg-white text-dams-blue inset-ring inset-ring-dams-line'}`}>
                  <dt className="text-xs font-semibold">{label}</dt>
                  <dd className="text-3xl font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-slate-600">
            第 {data.round.id} 轮 · {MEETUP_SECTIONS[data.round.section]}
            {data.round.closedAt !== null && ' · 历史回看'}
          </p>
          {frontQuestion ? (
            <div className="grid items-start gap-5 md:grid-cols-[3fr_2fr]">
              <div className="min-w-0 space-y-3">
                <article key={frontQuestion.id} aria-label="当前最高票问题"
                  className="shadow-[inset_4px_0_var(--color-dams-blue)] bg-dams-selection text-dams-ink rounded-2xl px-6 py-5">
                  <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm font-semibold">
                    <span className="rounded bg-dams-orange px-2 py-0.5">当前最高票</span>
                    <span>{frontQuestion.likes} 个赞</span>
                  </div>
                  <p className="wrap-anywhere text-2xl font-semibold leading-snug md:text-3xl [@media(max-height:650px)]:md:text-2xl">
                    {frontQuestion.body}
                  </p>
                </article>
                {nextQuestions.length > 0 && (
                  <ol aria-label="接下来" start={2} className="space-y-2">
                    {nextQuestions.map(question => (
                      <li key={question.id} className="flex items-start justify-between gap-3 rounded-xl border border-dams-selection bg-white px-4 py-3">
                        <p className="line-clamp-2 wrap-anywhere text-xl font-semibold">{question.body}</p>
                        <span className="shrink-0 text-sm text-slate-600">{question.likes} 赞</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {remainingQuestions.length > 0 && (
                <aside className="min-w-0 rounded-xl bg-white px-4 py-3 inset-ring inset-ring-dams-line">
                  <h2 className="mb-1 font-semibold text-dams-blue text-xl">其余待答（{remainingQuestions.length}）</h2>
                  <ol aria-label="其余待答问题" start={4} tabIndex={0}
                    className="max-h-[53vh] divide-y divide-dams-selection overflow-auto">
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
              className="max-h-[55vh] space-y-3 overflow-auto rounded-xl">
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

export function MeetupScreen({ mirror = false }: { mirror?: boolean }) {
  const { data, error, pending, submit } = useDiscussion<ProjectionView, ProjectionCommand>('/api/screen', 'projection', projectionTransport, '/api/screen/admin')
  const readyAt = data?.mode === 'raffle' && data.lottery?.phase === 'drawing' ? data.lottery.readyAt : null
  useRaffleResolution(mirror ? null : readyAt)

  useEffect(() => {
    if (mirror || data?.mode !== 'opening') return
    const { slide, revision } = data
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      if (pending || event.repeat) return
      const next = slide + (event.key === 'ArrowLeft' ? -1 : 1)
      if (next >= 0 && next < OPENING_SLIDE_COUNT) void submit({ mode: 'opening', slide: next, revision })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, mirror, pending, submit])

  if (data?.mode === 'opening' || data?.mode === 'raffle') {
    return (
      <main>
        <ScreenContent data={data} mirror={mirror} />
        {!mirror && data.mode === 'opening' && error && (
          <p role="alert" className="fixed right-4 bottom-4 left-4 mx-auto w-fit rounded-lg bg-white px-3 py-2 text-sm text-red-700 shadow">
            {error}
          </p>
        )}
      </main>
    )
  }
  const active = data && data.mode !== 'hidden'
  return (
    <main className={active
      ? `grid min-h-svh bg-white px-5 py-10 text-center text-dams-ink ${data.mode === 'qa' ? 'content-start [@media(max-height:650px)]:py-5' : 'content-center'}`
      : 'min-h-svh bg-black'}>
      {active && <ScreenContent data={data} mirror={mirror} />}
    </main>
  )
}
