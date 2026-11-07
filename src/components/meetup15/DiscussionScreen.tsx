'use client'

import type { StaffSnapshot } from '@/lib/meetup15/discussion'
import { MEETUP_SECTIONS } from '@/lib/meetup15/event'
import { AdmissionScreen } from './AdmissionScreen'
import { useDiscussion } from './useDiscussion'

export function DiscussionScreen() {
  const { data, error } = useDiscussion<StaffSnapshot>('/api/discussion/screen')
  const round = data?.activeRound
  if (!round) return <AdmissionScreen />

  return (
    <section aria-label="本轮嘉宾问答" className="space-y-4 text-left">
      <h2 className="text-3xl font-semibold">嘉宾问答 · {round.guest}</h2>
      <p className="text-zinc-300">第 {round.id} 轮 · {MEETUP_SECTIONS[round.section]}</p>
      {error && <p role="alert" className="text-amber-200">{error}</p>}
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
}
