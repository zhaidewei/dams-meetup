import Link from 'next/link'
import { MeetupAgenda, MeetupHeading, MeetupNav } from '@/components/meetup15/MeetupAgenda'
import { meetupPhase } from '@/lib/meetup15/event'
import { isAdmissionOpen } from '@/lib/meetup15/identity'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'

const feedback: Record<string, string> = {
  closed: '观众入口当前关闭，请留意现场通知。',
  invalid: '入场凭据有误，请核对现场大屏或重新扫码。',
  recovery: '恢复链接无效。请使用第 15 期「我」页面里的链接。',
  ended: '本届互动区的开放时间已结束。',
}

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ entry?: string }>
}) {
  const [{ entry }, member, open] = await Promise.all([
    searchParams, currentMember(), isAdmissionOpen(meetupEnv()),
  ])
  const phase = meetupPhase()

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-8 sm:py-12">
      <MeetupNav />
      <MeetupHeading />
      <section aria-labelledby="entry-title" className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50 p-5">
        <h2 id="entry-title" className="text-lg font-semibold">观众入场</h2>
        {entry && Object.hasOwn(feedback, entry) && <p role="alert">{feedback[entry]}</p>}
        {member ? (
          <Link className="font-medium text-teal-900 underline" href="/feed">进入互动区</Link>
        ) : open ? (
          <form method="post" action="/api/meetup/enter" className="space-y-2">
            <input type="hidden" name="method" value="password" />
            <label htmlFor="entry-password" className="block text-sm">现场入场密码</label>
            <div className="flex flex-wrap gap-2">
              <input id="entry-password" name="credential" autoComplete="off" maxLength={30} required
                className="min-w-0 flex-1 rounded border border-zinc-400 bg-white px-3 py-2" />
              <button className="rounded bg-teal-900 px-4 py-2 text-white">入场</button>
            </div>
          </form>
        ) : (
          <p>{phase !== 'event' ? '观众入场已结束。' : '观众入口暂未开放。'}</p>
        )}
        <p className="flex flex-wrap gap-4 text-sm">
          {phase !== 'closed' && <Link href="/vip-login" className="underline">嘉宾登录</Link>}
          <Link href="/admin" className="underline">工作人员入口</Link>
        </p>
      </section>
      <MeetupAgenda />
      <Link className="text-sm text-teal-900 underline" href="/summary">查看第 14 期复盘</Link>
    </main>
  )
}
