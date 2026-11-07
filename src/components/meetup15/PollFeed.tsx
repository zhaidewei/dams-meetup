'use client'

import { type FormEvent, useState } from 'react'
import type { MeetupSection } from '@/lib/meetup15/event'
import type { Poll, PollCommand, PollFeedSnapshot } from '@/lib/meetup15/polls'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { PollResults } from './PollResults'
import { useDiscussion } from './useDiscussion'

type Submit = (command: PollCommand) => Promise<boolean>

function CreatePoll({ section, pending, submit }: { section: MeetupSection; pending: boolean; submit: Submit }) {
  const [optionCount, setOptionCount] = useState(2)
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    if (await submit({
      action: 'create', section, title: String(data.get('title')), options: data.getAll('option').map(String),
      multiple: data.get('kind') === 'multiple', hidden: data.has('hidden'),
    })) {
      form.reset()
      setOptionCount(2)
    }
  }

  return (
    <details className="rounded-lg border border-zinc-200 p-3">
      <summary className="cursor-pointer font-medium">发起投票</summary>
      <form onSubmit={create} className="mt-3 space-y-3">
        <label className="block text-sm">投票标题
          <input className={discussionInput} name="title" maxLength={300} required />
        </label>
        <div>
          <label className="block text-sm" htmlFor="meetup-poll-kind">投票类型</label>
          <select id="meetup-poll-kind" name="kind" className={discussionInput}>
            <option value="single">单选</option>
            <option value="multiple">多选</option>
          </select>
        </div>
        {Array.from({ length: optionCount }, (_, index) => (
          <label className="block text-sm" key={index}>选项 {index + 1}
            <input className={discussionInput} name="option" maxLength={120} required />
          </label>
        ))}
        <div className="flex flex-wrap gap-2">
          <button className={discussionButton} type="button" disabled={optionCount >= 6}
            onClick={() => setOptionCount(optionCount + 1)}>添加选项</button>
          <button className={discussionButton} type="button" disabled={optionCount <= 2}
            onClick={() => setOptionCount(optionCount - 1)}>移除末项</button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="hidden" /> 隐藏分项票数
        </label>
        <p className="text-sm text-zinc-600">投票在活动结束时截止。你可以提前结束。</p>
        <button className={discussionButton} disabled={pending}>发布投票</button>
      </form>
    </details>
  )
}

function Vote({ poll, pending, submit }: { poll: Poll; pending: boolean; submit: Submit }) {
  const [choices, setChoices] = useState(poll.ballot)
  return (
    <form className="space-y-2" onSubmit={(event) => {
      event.preventDefault()
      void submit({ action: 'vote', id: poll.id, choices })
    }}>
      <fieldset disabled={pending} className="space-y-2">
        <legend className="sr-only">选择投票选项</legend>
        {poll.options.map((option, index) => (
          <label key={option} className="flex cursor-pointer items-baseline gap-3 rounded border border-zinc-200 px-3 py-2">
            <input type={poll.multiple ? 'checkbox' : 'radio'} name={`poll-${poll.id}`}
              checked={choices.includes(index)} onChange={(event) => {
                setChoices(poll.multiple
                  ? event.target.checked ? [...choices, index] : choices.filter((choice) => choice !== index)
                  : [index])
              }} />
            <span className="min-w-0 flex-1 break-words">{option}</span>
            {poll.counts && <span className="shrink-0 tabular-nums">{poll.counts[index]} 票</span>}
          </label>
        ))}
      </fieldset>
      <button className={discussionButton} disabled={pending || !choices.length}>
        {poll.ballot.length ? '保存改投' : '提交投票'}
      </button>
    </form>
  )
}

export function PollFeed({ section }: { section: MeetupSection }) {
  const { data, error, pending, submit } = useDiscussion<PollFeedSnapshot, PollCommand>(`/api/polls?section=${section}`, section)
  if (!data && !error) return null
  if (!error && data && !data.canCreate && !data.polls.length) return null
  return (
    <section aria-label="板块投票" className="space-y-3">
      <h3 className="text-lg font-semibold">投票</h3>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {data?.canCreate && <CreatePoll key={section} section={section} pending={pending} submit={submit} />}
      {data?.polls.map((poll) => (
        <article key={poll.id} className="space-y-3 rounded-xl border border-zinc-200 p-4">
          <h4 className="break-words text-lg font-semibold">{poll.title}</h4>
          <p className="text-sm text-zinc-600">
            {poll.author} · {poll.multiple ? '多选' : '单选'} · {poll.closed ? '已截止' : '进行中'} · {poll.voters} 人投票
          </p>
          {!poll.closed && data.canVote
            ? <Vote key={poll.ballot.join(',')} poll={poll} pending={pending} submit={submit} />
            : <PollResults poll={poll} />}
          {!poll.counts && <p className="text-sm text-zinc-600">投票后或投票截止后可查看分项票数。</p>}
          {!poll.closed && poll.mine && (
            <button className={discussionButton} disabled={pending}
              onClick={() => void submit({ action: 'close', id: poll.id })}>提前结束投票</button>
          )}
        </article>
      ))}
    </section>
  )
}
