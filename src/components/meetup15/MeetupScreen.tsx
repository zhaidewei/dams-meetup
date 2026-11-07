'use client'

import { useEffect, useState } from 'react'
import { MEETUP_NAME, MEETUP_SECTIONS, MEETUP_THEME } from '@/lib/meetup15/event'
import type { Poll, ScreenSnapshot } from '@/lib/meetup15/polls'
import { AdmissionScreen } from './AdmissionScreen'
import { IntroDeck } from './IntroDeck'
import { PollResults } from './PollResults'
import { useDiscussion } from './useDiscussion'

function ProjectedPoll({ poll, revealed }: { poll: Poll; revealed?: boolean }) {
  return (
    <section aria-label={revealed ? '投票结果' : '现场投票'} className="space-y-4 text-left">
      <p className="text-lg font-medium text-teal-300">{revealed ? '投票结果' : '现场投票'} · {MEETUP_SECTIONS[poll.section]}</p>
      <h2 className="break-words text-3xl font-semibold md:text-5xl">{poll.title}</h2>
      <div className="text-xl md:text-2xl"><PollResults poll={poll} /></div>
      <p className="text-lg text-zinc-300">{poll.voters} 人投票{!poll.counts && ' · 分项结果待主办方揭晓'}</p>
    </section>
  )
}

function LiveScreen({ agenda, online, polls }: { agenda: string; online: number; polls: Poll[] }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!polls.length) return
    const timer = window.setInterval(() => setStep((current) => current + 1), 8000)
    return () => window.clearInterval(timer)
  }, [polls.length])
  const poll = step % 2 === 1 && polls[Math.floor(step / 2) % polls.length]
  if (poll) return <ProjectedPoll poll={poll} />

  return (
    <section aria-label="现场互动首页" className="space-y-5">
      <h2 className="text-3xl font-semibold md:text-5xl">{MEETUP_THEME}</h2>
      <p className="text-xl">当前议程 · {agenda}</p>
      <p className="text-lg text-zinc-300">在线 {online} 人</p>
      <AdmissionScreen />
    </section>
  )
}

function ScreenContent({ data }: { data: ScreenSnapshot }) {
  switch (data.mode) {
    case 'reveal':
      return <ProjectedPoll poll={data.poll} revealed />
    case 'lottery':
      return (
        <section aria-label="现场抽奖" className="space-y-4">
          <h2 className="text-5xl font-semibold">现场抽奖</h2>
          {data.lottery.phase === 'drawing'
            ? <p className="animate-pulse text-3xl motion-reduce:animate-none">抽奖进行中</p>
            : <p className="break-words text-4xl">恭喜 {data.lottery.winner}！</p>}
        </section>
      )
    case 'qa':
      return (
        <section aria-label="本轮嘉宾问答" className="space-y-4 text-left">
          <h2 className="text-3xl font-semibold">嘉宾问答 · {data.round.guest}</h2>
          <p className="text-zinc-300">第 {data.round.id} 轮 · {MEETUP_SECTIONS[data.round.section]}</p>
          {data.questions.length ? (
            <ol className="max-h-[55vh] space-y-3 overflow-y-auto">
              {data.questions.map((question) => (
                <li key={question.id} className="rounded-lg border border-zinc-700 px-4 py-3">
                  <p className="whitespace-pre-wrap break-words text-xl">{question.body}</p>
                  <p className="mt-1 text-sm text-zinc-300">{question.likes} 个赞 · {question.answered ? '已答' : '未答'}</p>
                </li>
              ))}
            </ol>
          ) : <p className="text-zinc-300">本轮还没有问题。</p>}
        </section>
      )
    case 'intro':
      return <IntroDeck />
    case 'live':
      return <LiveScreen agenda={data.agenda} online={data.online} polls={data.polls} />
  }
}

export function MeetupScreen() {
  const { data, error } = useDiscussion<ScreenSnapshot>('/api/polls/screen', 'both')
  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      {data?.mode !== 'intro' && <h1 className="text-lg font-medium text-teal-300">{MEETUP_NAME}</h1>}
      {error && <p role="alert" className="text-amber-200">{error}</p>}
      {data ? <ScreenContent data={data} /> : !error && <p>正在加载大屏…</p>}
    </div>
  )
}
