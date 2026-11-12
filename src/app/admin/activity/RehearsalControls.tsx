import { readLiveStats } from '../../../../cloudflare/activity-stats'
import { meetupNow, REHEARSAL_END } from '@/lib/meetup15/event'
import { meetupEnv } from '@/lib/meetup15/server'

const feedback: Record<string, { message: string; success?: boolean }> = {
  cleared: { message: '彩排数据已清空，嘉宾账号已保留。', success: true },
  filled: { message: '预设已填入。问答在「专家分享」板块，观众入口已关闭。', success: true },
  closed: { message: '彩排数据操作已关闭。' },
  invalid: { message: '请求无效，请刷新后重试。' },
  changed: { message: '活动状态已变化，请核对当前数据后重试。' },
  blocked: { message: '请核对活动状态。填充需要至少一位嘉宾，且本届互动数据为空。' },
}

export async function RehearsalControls({ status }: { status?: string }) {
  const env = meetupEnv()
  const now = meetupNow(env)
  const [{ counts }, state] = await Promise.all([
    readLiveStats(env.ACTIVITY_DB, now),
    env.ACTIVITY_DB.prepare('SELECT revision FROM activity_state WHERE id = 1').first<{ revision: number }>(),
  ])
  const notice = status && Object.hasOwn(feedback, status) ? feedback[status] : null
  const disabled = now >= REHEARSAL_END || !state
  const hasData = Boolean(counts && (counts.attendees || counts.posts || counts.replies || counts.questions || counts.raffleRounds))
  const canFill = !disabled && Boolean(counts?.guests) && !hasData

  return (
    <section className="max-w-3xl space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">管理彩排</h1>
        <p className="text-sm text-zinc-700">11 月 14 日 00:00（荷兰时间）起停用这两个操作，保护正式活动数据。</p>
        {counts && <p className="text-sm text-zinc-700">
          当前数据 · {counts.attendees} 位观众 · {counts.guests} 位嘉宾 · {counts.posts} 篇帖子 · {counts.questions} 条问题
        </p>}
        {notice && <p role={notice.success ? 'status' : 'alert'}>{notice.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <form method="post" action="/api/admin/meetup-rehearsal" className="space-y-3 rounded-xl border border-dams-line bg-white p-4">
          <input type="hidden" name="action" value="fill" />
          <input type="hidden" name="revision" value={state?.revision} />
          <h2 className="font-semibold">填入预设</h2>
          <p className="text-sm text-zinc-700">
            加入 6 位模拟观众、5 篇帖子、2 条回复、1 轮专家分享问答和 1 轮历史抽奖。使用最早配置的嘉宾开启问答。
          </p>
          <p className="text-sm text-zinc-700">互动数据为空且已配置嘉宾时可填充。填充后观众入口关闭，大屏隐藏。</p>
          <button disabled={!canFill} className="min-h-11 rounded-md bg-dams-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            填入彩排预设
          </button>
        </form>
        <form method="post" action="/api/admin/meetup-rehearsal" className="space-y-3 rounded-xl border border-dams-line bg-white p-4">
          <input type="hidden" name="action" value="clear" />
          <input type="hidden" name="revision" value={state?.revision} />
          <h2 className="font-semibold">清空彩排</h2>
          <p className="text-sm text-zinc-700">
            删除本届所有观众账号、帖子、回复、问答、私信和抽奖记录，保留嘉宾资料及登录凭据。
          </p>
          <p className="text-sm text-zinc-700">清空后观众入口关闭、议程恢复自动、大屏隐藏。此操作无法撤销。</p>
          <button disabled={disabled} className="min-h-11 rounded-md bg-red-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            清空彩排数据
          </button>
        </form>
      </div>
    </section>
  )
}
