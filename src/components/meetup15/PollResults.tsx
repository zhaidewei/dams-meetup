import type { Poll } from '@/lib/meetup15/polls'

export function PollResults({ poll }: { poll: Poll }) {
  return (
    <ul className="space-y-2">
      {poll.options.map((option, index) => (
        <li key={option} className="flex items-baseline justify-between gap-4 rounded border border-current/20 px-3 py-2">
          <span className="min-w-0 break-words">{option}</span>
          {poll.counts && <span className="shrink-0 tabular-nums">{poll.counts[index]} 票</span>}
        </li>
      ))}
    </ul>
  )
}
