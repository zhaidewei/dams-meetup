import Link from 'next/link'
import { MEETUP_NAME, MEETUP_THEME } from '@/lib/meetup15/event'
import { meetupEnv } from '@/lib/meetup15/server'
import { readMeetupSummary, SUMMARY_METRICS, type SummaryMetrics } from '@/lib/meetup15/summary'

export const dynamic = 'force-dynamic'
export const metadata = { title: '第 15 期活动复盘 · DAMS' }

const number = new Intl.NumberFormat('zh-CN')

export default async function MeetupSummaryPage() {
  const summary = await readMeetupSummary(meetupEnv().ACTIVITY_DB)
  const metrics: SummaryMetrics = summary ? JSON.parse(summary.metrics) : {}

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10 sm:py-16">
      <nav aria-label="活动复盘导航" className="flex flex-wrap gap-4 text-sm">
        <Link href="/agenda" className="underline">第 15 期议程</Link>
        <Link href="/summary/14" className="underline">第 14 期复盘</Link>
        <Link href="/admin" className="underline">工作人员入口</Link>
      </nav>
      <header className="space-y-2">
        <p className="text-sm font-semibold text-dams-blue">{MEETUP_NAME}</p>
        <h1 className="text-3xl font-semibold">第 15 期活动复盘</h1>
        <p>{MEETUP_THEME}</p>
      </header>
      {summary ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(SUMMARY_METRICS).map(([key, label]) => {
            const count = metrics[key as keyof SummaryMetrics]
            return count === undefined ? null : (
              <div key={key} className="rounded-xl border border-dams-line bg-white p-4">
                <dt className="text-sm text-zinc-600">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{number.format(count)}</dd>
              </div>
            )
          })}
        </dl>
      ) : <p className="text-sm text-zinc-600">本届复盘尚未发布。</p>}
    </main>
  )
}
