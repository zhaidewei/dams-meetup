import { useEffect, useState } from 'react'
import { MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_THEME } from '@/lib/meetup15/event'
import { AdmissionScreen } from './AdmissionScreen'

const slides = [
  { title: MEETUP_THEME, body: <><p>{MEETUP_NAME}</p><p>{MEETUP_DATE}</p></> },
  {
    title: '今天聊什么',
    body: (
      <ol className="mx-auto grid w-fit gap-2 text-left">
        {MEETUP_AGENDA.filter(({ section }) => section !== 'lounge').map(({ start, title }) => (
          <li key={start} className="flex gap-3">
            <span className="font-mono text-amber-300">{start}</span>
            <span>{title}</span>
          </li>
        ))}
      </ol>
    ),
  },
  {
    title: '把话题带到全场',
    body: (
      <dl className="grid gap-3 sm:grid-cols-3">
        {[
          ['讨论', '在讨论区分享想法，或加入感兴趣的分组。'],
          ['嘉宾问答', '提交问题，给想听嘉宾回答的问题点赞。'],
          ['现场抽奖', '主办方公布结果，中奖者会收到站内消息。'],
        ].map(([label, description]) => (
          <div key={label} className="rounded-xl bg-slate-800 p-3 text-left md:p-5">
            <dt className="mb-1 font-bold text-amber-300">{label}</dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  { title: '加入现场互动', body: null },
]

export function OpeningDeck({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  const slide = slides[index]
  const last = slides.length - 1

  useEffect(() => {
    if (compact) return

    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

      event.preventDefault()
      const step = event.key === 'ArrowLeft' ? -1 : 1
      setIndex((current) => Math.max(0, Math.min(current + step, last)))
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compact, last])

  const button = 'min-h-11 rounded-lg border border-slate-500 px-3 text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50'

  return (
    <section aria-label="开场介绍" className={compact
      ? 'grid min-h-56 grid-rows-[1fr_auto] gap-4 rounded-lg bg-slate-950 p-4 text-slate-100'
      : 'grid min-h-svh grid-rows-[1fr_auto] gap-5 bg-slate-950 px-6 py-5 text-center text-slate-100 sm:px-12'}>
      <div className="mx-auto grid w-full max-w-6xl content-center gap-4" aria-live="polite">
        <h1 className={compact
          ? 'text-xl font-bold text-amber-300'
          : 'text-[clamp(2rem,5vw,5rem)] leading-tight font-bold text-amber-300'}>
          {slide.title}
        </h1>
        <div className={compact ? 'space-y-2 text-sm' : 'space-y-3 text-[clamp(1rem,2vw,2rem)]'}>
          {slide.body ?? <AdmissionScreen compact={compact} />}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-slate-300">
        {compact
          ? <button type="button" className={button} disabled={index === 0} onClick={() => setIndex(index - 1)}>上一页</button>
          : <span>← → 翻页</span>}
        <span role="status" className="tabular-nums">{index + 1} / {slides.length}</span>
        {compact && <button type="button" className={button} disabled={index === last} onClick={() => setIndex(index + 1)}>下一页</button>}
      </div>
    </section>
  )
}
