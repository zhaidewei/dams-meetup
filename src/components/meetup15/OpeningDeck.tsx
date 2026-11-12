import { useEffect, useState } from 'react'
import { AdmissionScreen } from './AdmissionScreen'

const slides = [
  {
    title: 'DAMS 现场互动工具',
    body: <><p>想找同行交流，或把问题交给台上的嘉宾？</p><p>用手机打开网页，就能参与全场讨论和问答。</p></>,
  },
  {
    title: '发帖、找同好、聊下去',
    body: (
      <ol className="mx-auto grid w-fit list-decimal gap-3 pl-6 text-left marker:text-amber-300">
        <li>在「我的 → 资料」填写昵称。</li>
        <li>在「自由讨论区」发帖交流，或到「议程讨论区」加入对应环节的讨论。</li>
        <li>想继续聊？点对方头像发私信，在「我的 → 私信」查看回复。</li>
      </ol>
    ),
  },
  {
    title: '嘉宾问答和现场抽奖',
    body: (
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ['嘉宾问答', '主持人开启问答后，到标有「问答中」的板块提问，也可以给别人的问题点赞。大屏优先展示点赞最多的待答问题。'],
          ['现场抽奖', '抽奖结果在大屏公布，中奖者会收到站内私信。'],
        ].map(([label, description]) => (
          <div key={label} className="rounded-xl bg-slate-800 p-3 text-left md:p-5">
            <dt className="mb-1 font-bold text-amber-300">{label}</dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  { title: '扫码入场，开始互动', body: null },
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
          {slide.body === null && <p>从「我的 → 恢复链接」保存链接，换手机时可找回同一个身份。</p>}
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
