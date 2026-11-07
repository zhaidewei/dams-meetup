'use client'

import { useEffect, useState } from 'react'
import { MEETUP_AGENDA, MEETUP_DATE, MEETUP_NAME, MEETUP_THEME, MEETUP_VENUE } from '@/lib/meetup15/event'
import { AdmissionScreen } from './AdmissionScreen'

const slides = ['欢迎', '今日议程', '分组交流', '现场互动']
const breakout = MEETUP_AGENDA.find((slot) => slot.section === 'breakout')

export function IntroDeck() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    function turn(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        const direction = event.key === 'ArrowRight' ? 1 : -1
        setIndex((current) => Math.min(slides.length - 1, Math.max(0, current + direction)))
      }
    }
    window.addEventListener('keydown', turn)
    return () => window.removeEventListener('keydown', turn)
  }, [])

  return (
    <section aria-label="开场介绍" className="mx-auto w-full max-w-6xl space-y-8">
      <header className="space-y-3">
        <p className="text-lg font-medium text-teal-300">{MEETUP_NAME} · 开场介绍</p>
        <h1 className="text-4xl font-bold md:text-6xl">{index === 0 ? MEETUP_THEME : slides[index]}</h1>
      </header>
      {index === 0 && <p className="space-y-2 text-xl text-zinc-300">
        <span className="block">{MEETUP_DATE}</span><span className="block">{MEETUP_VENUE}</span>
      </p>}
      {index === 1 && (
        <ol className="mx-auto grid max-w-4xl gap-3 text-left text-lg md:text-2xl">
          {MEETUP_AGENDA.map((slot) => (
            <li key={slot.start} className="grid gap-x-6 rounded bg-zinc-900 px-4 py-3 sm:grid-cols-[auto_1fr]">
              <span className="font-mono text-teal-300">{slot.start}–{slot.end}</span><span>{slot.title}</span>
            </li>
          ))}
        </ol>
      )}
      {index === 2 && <ul className="grid gap-3 text-left text-xl md:grid-cols-3">
        {breakout?.details?.map((group) => <li className="rounded bg-zinc-900 p-4" key={group}>{group}</li>)}
      </ul>}
      {index === 3 && <>
        <p className="text-xl text-zinc-300">现场讨论 · 嘉宾问答 · 投票</p>
        <AdmissionScreen />
      </>}
      <footer className="text-base text-zinc-400">← → 翻页 · {index + 1} / {slides.length}</footer>
    </section>
  )
}
