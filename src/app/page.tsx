import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MeetupAgenda, MeetupHeading, MeetupNav } from '@/components/meetup15/MeetupAgenda'
import { meetupNow, meetupPhase } from '@/lib/meetup15/event'
import { isAdmissionOpen } from '@/lib/meetup15/identity'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'
import { LATEST_SUMMARY_PATH } from '@/lib/meetup15/summary'

export const dynamic = 'force-dynamic'

const feedback: Record<string, string> = {
  closed: '观众入口当前关闭，请留意现场通知。',
  invalid: '入场凭据有误，请核对现场大屏或重新扫码。',
  already: '这个浏览器已登录另一个身份。请在新设备或私密浏览窗口打开恢复链接。',
  recovery: '恢复链接无效。请使用第 15 期「恢复链接」页面里的链接。',
  ended: '本届互动区的开放时间已结束。',
}

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ entry?: string }>
}) {
  const env = meetupEnv()
  const now = meetupNow(env)
  const phase = meetupPhase(now)
  if (phase === 'closed') redirect(LATEST_SUMMARY_PATH)
  const [{ entry }, member, open] = await Promise.all([
    searchParams, currentMember(now), isAdmissionOpen(env, now),
  ])

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-4 sm:space-y-8 sm:px-5 sm:py-12">
      <MeetupNav />
      <MeetupHeading />
      <section aria-labelledby="entry-title" className="space-y-3 rounded-2xl border border-dams-selection bg-dams-wash p-5">
        <h2 id="entry-title" className="text-lg font-semibold">观众入场</h2>
        {entry && Object.hasOwn(feedback, entry) && <p role="alert">{feedback[entry]}</p>}
        {member ? (
          <Link className="inline-flex min-h-11 items-center rounded-full bg-dams-blue px-5 font-semibold text-white" href="/feed">进入互动区</Link>
        ) : open ? (
          <form method="post" action="/api/meetup/enter" className="space-y-2">
            <input type="hidden" name="method" value="password" />
            <label htmlFor="entry-password" className="block text-sm">现场入场密码</label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input id="entry-password" name="credential" autoComplete="off" maxLength={30} required
                className="min-h-11 min-w-0 rounded-lg border border-zinc-400 bg-white px-3 py-2" />
              <button className="min-h-11 rounded-full bg-dams-blue px-5 py-2 font-medium text-white">入场</button>
            </div>
          </form>
        ) : (
          <>
            <p>{phase !== 'event' ? '观众入场已结束。' : '观众入口暂未开放。'}</p>
            {phase === 'event' && (
              <form action="/">
                <button className="min-h-11 text-sm font-medium text-dams-hover underline">刷新入场状态</button>
              </form>
            )}
          </>
        )}
        <p className="flex flex-wrap gap-x-4 text-sm [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center">
          <Link href="/vip-login" className="underline">嘉宾登录</Link>
          <Link href="/admin" className="underline">工作人员入口</Link>
        </p>
      </section>
      <MeetupAgenda />
      <Link className="text-sm text-dams-hover underline" href="/summary/14">查看第 14 期复盘</Link>
    </main>
  )
}
