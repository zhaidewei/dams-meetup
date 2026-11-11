import Link from 'next/link'
import { ADMISSION_END, INTERACTION_END, meetupNow } from '@/lib/meetup15/event'
import { meetupEnv } from '@/lib/meetup15/server'
import { readMeetupSummary, SUMMARY_METRICS } from '@/lib/meetup15/summary'

const feedback: Record<string, { message: string; success?: boolean }> = {
  published: { message: '第 15 期复盘已发布。', success: true },
  cleaned: { message: '本届互动数据已清理，公开复盘仍可访问。', success: true },
  invalid: { message: '请上传只包含支持字段和非负整数的 JSON 文件。' },
  early: { message: '尚未到此操作的开放时间。' },
  confirm: { message: '请先确认复盘已归档。' },
  changed: { message: '复盘版本已变更。请打开公开复盘核对，再确认归档。' },
}

export async function SummaryControls({ status }: { status?: string }) {
  const env = meetupEnv()
  const summary = await readMeetupSummary(env.ACTIVITY_DB)
  const now = meetupNow(env)
  const cleaned = summary?.cleanedAt != null
  const notice = status && Object.hasOwn(feedback, status) ? feedback[status] : null

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">复盘与归档</h1>
        <Link className="text-sm text-dams-hover underline" href="/summary/15" target="_blank" rel="noopener">查看第 15 期公开复盘</Link>
        {notice && <p role={notice.success ? 'status' : 'alert'}>{notice.message}</p>}
      </div>

      <section className="space-y-3 rounded-xl border border-dams-line p-4">
        <h2 className="font-semibold">上传公开复盘</h2>
        <p className="text-sm text-zinc-700">活动结束后上传汇总 JSON。发布内容只包含活动汇总数字。</p>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          {Object.entries(SUMMARY_METRICS).map(([key, label]) => (
            <div key={key} className="contents">
              <dt className="font-mono">{key}</dt><dd>{label}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-zinc-700">例如 <code>{'{"attendees":180,"posts":23,"questions":12}'}</code></p>
        <form method="post" encType="multipart/form-data" action="/api/admin/meetup-summary" className="space-y-3">
          <input type="hidden" name="action" value="publish" />
          <label className="block text-sm font-medium">
            复盘 JSON 文件
            <input type="file" name="summary" accept=".json,application/json" required disabled={now < ADMISSION_END}
              className="mt-1 block max-w-full text-sm" />
          </label>
          <button className="rounded-md bg-dams-hover px-3 py-2 text-sm text-white disabled:opacity-50" disabled={now < ADMISSION_END}>
            {summary ? '更新公开复盘' : '发布复盘'}
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-xl border border-dams-line p-4">
        <h2 className="font-semibold">手动清理本届数据</h2>
        <p className="text-sm text-zinc-700">11 月 21 日 18:00（荷兰时间）关闭互动后，核对公开复盘并确认已归档。清理会删除本届身份、讨论、问答、私信和抽奖记录，保留各期公开复盘。</p>
        {cleaned ? <p role="status">本届数据已清理。</p> : summary && now >= INTERACTION_END ? (
          <form method="post" action="/api/admin/meetup-summary" className="space-y-3">
            <input type="hidden" name="action" value="cleanup" />
            <input type="hidden" name="revision" value={summary.revision} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="archived" value="yes" required className="mt-0.5" />
              我已核对第 15 期公开复盘，并确认复盘已归档。
            </label>
            <button className="rounded-md bg-red-800 px-3 py-2 text-sm text-white">清理本届互动数据</button>
          </form>
        ) : <p className="text-sm text-zinc-600">{now < INTERACTION_END ? '互动开放期间无法清理。' : '发布本届复盘后可以确认归档。'}</p>}
      </section>
    </section>
  )
}
