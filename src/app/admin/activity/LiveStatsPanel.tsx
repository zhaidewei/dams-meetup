'use client'

import type { LiveStats } from '@/lib/meetup15/live-stats'
import { useDiscussion } from '@/components/meetup15/useDiscussion'

const metrics = {
  attendees: '已入场观众',
  recentAttendees: '近 5 分钟活跃观众',
  guests: '已配置嘉宾',
  posts: '帖子',
  replies: '回复',
  questions: '提问',
  likes: '点赞',
  reactions: '表情反应',
  raffleRounds: '已完成抽奖轮次',
} satisfies Record<keyof LiveStats, string>

const time = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

export function LiveStatsPanel() {
  const { data, error, retry } = useDiscussion<{ counts: LiveStats | null; updatedAt: number; refreshAt: null }>(
    '/api/activity/stats', 'stats',
  )

  return (
    <section aria-labelledby="live-stats-heading" className="space-y-4 rounded-2xl border border-dams-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="live-stats-heading" className="text-xl font-semibold">实时统计</h1>
        {data && <p className="text-sm text-slate-600">更新于 {time.format(data.updatedAt)} · 荷兰时间</p>}
      </div>
      <p className="text-sm text-slate-700">每 10 秒刷新。活跃观众按最近一次活动时间统计。</p>
      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void retry()} className="min-h-11 rounded-full border border-dams-line px-4 text-sm font-semibold text-dams-hover">重试</button>
        </div>
      )}
      {data?.counts ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.keys(metrics) as (keyof LiveStats)[]).map(key => (
            <div key={key} className="min-w-0 rounded-xl border border-dams-selection bg-dams-wash p-3 sm:p-4">
              <dt className="text-sm text-slate-700">{metrics[key]}</dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums text-dams-hover">{data.counts?.[key]}</dd>
            </div>
          ))}
        </dl>
      ) : !error && <p role="status" className="text-sm">正在读取实时统计…</p>}
    </section>
  )
}
