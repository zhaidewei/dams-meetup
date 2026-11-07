'use client'

import { useState } from 'react'
import type { RaffleAdminSnapshot, RaffleCommand } from '@/lib/meetup15/raffle'
import { discussionButton } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'
import { useRaffleResolution } from './useRaffleResolution'

export function RaffleControls() {
  const [weighted, setWeighted] = useState(true)
  const [requireParticipation, setRequireParticipation] = useState(false)
  const { data, error, pending, submit } = useDiscussion<RaffleAdminSnapshot, RaffleCommand>('/api/raffle', 'projection')
  useRaffleResolution(data?.result?.phase === 'drawing' ? data.result.readyAt : null)

  return (
    <section className="space-y-3 border-t border-zinc-200 pt-3" aria-label="抽奖设置">
      <h3 className="font-semibold">抽奖设置</h3>
      <p className="text-sm text-zinc-600">从最近 4 小时内活跃的观众中抽取，排除嘉宾和本场已中奖的人。</p>
      <label className="block text-sm">
        <input type="checkbox" checked={requireParticipation} onChange={(event) => setRequireParticipation(event.target.checked)} /> 要求至少发过一次帖或回复
      </label>
      <label className="block text-sm">
        <input type="checkbox" checked={weighted} onChange={(event) => setWeighted(event.target.checked)} /> 按互动加权
      </label>
      {weighted && <p className="text-sm text-zinc-600">发过文字帖加 1，收到过回复加 1。</p>}
      {data?.result?.phase === 'drawing' && <p role="status">已锁定 {data.result.candidateCount} 位候选人，正在抽奖。</p>}
      {data?.result?.phase === 'winner' && <p role="status">中奖人：{data.result.winner}</p>}
      {data?.result?.phase === 'empty' && <p role="status">本轮没有符合条件的候选人。</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="button" className={discussionButton} disabled={!data || pending || data.result?.phase === 'drawing'}
        onClick={() => data && void submit({ action: 'start', weighted, requireParticipation, latestId: data.latestId })}>
        开始抽奖
      </button>
    </section>
  )
}
