import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MeetupAgenda, MeetupHeading } from '@/components/meetup15/MeetupAgenda'
import { MeetupMemberLayout } from '@/components/meetup15/MeetupMemberNav'
import { isMeetupSection, meetupDiscussionPath, meetupNow, meetupPhase } from '@/lib/meetup15/event'
import { isAdmissionOpen } from '@/lib/meetup15/identity'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'
import { LATEST_SUMMARY_PATH } from '@/lib/meetup15/summary'

export const dynamic = 'force-dynamic'

const entryLink = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-dams-selection bg-white px-3 py-2 text-center text-sm font-semibold text-dams-blue hover:bg-dams-selection focus-visible:outline-2 focus-visible:outline-dams-blue'

const feedback: Record<string, string> = {
  join: '入场后即可进入讨论区。',
  closed: '观众入口当前关闭，请留意现场通知。',
  invalid: '入场凭据有误，请核对现场大屏或重新扫码。',
  already: '这个浏览器已登录另一个身份。请在新设备或私密浏览窗口打开恢复链接。',
  recovery: '恢复链接无效。请使用第 15 期「我的」页面里的恢复链接。',
  ended: '本届互动区的开放时间已结束。',
}

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ entry?: string; section?: string }>
}) {
  const env = meetupEnv()
  const now = meetupNow(env)
  const phase = meetupPhase(now)
  if (phase === 'closed') redirect(LATEST_SUMMARY_PATH)
  const [{ entry, section }, member, open] = await Promise.all([
    searchParams, currentMember(now), isAdmissionOpen(env, now),
  ])
  const discussionSection = isMeetupSection(section) ? section : undefined

  return (
    <MeetupMemberLayout active="/">
      <div className="space-y-5 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6">
        <MeetupHeading />
        <section id="entry-title" aria-label="活动入口" className="scroll-mt-4 space-y-3 rounded-2xl border border-dams-selection bg-dams-wash p-3 sm:p-5">
          <nav aria-label="选择入口" className="grid gap-2 min-[360px]:grid-cols-3">
            <Link href={member ? meetupDiscussionPath(discussionSection) : '#audience-entry'} className={entryLink}>观众入口</Link>
            <Link href="/vip-login" className={entryLink}>嘉宾登录</Link>
            <Link href="/admin" className={entryLink}>工作人员入口</Link>
          </nav>
          {entry && Object.hasOwn(feedback, entry) && <p role="alert">{feedback[entry]}</p>}
          {!member && (
            <div id="audience-entry" className="scroll-mt-4 border-t border-dams-selection pt-3">
              {open ? (
                <form method="post" action="/api/meetup/enter" className="space-y-2">
                  <input type="hidden" name="method" value="password" />
                  {discussionSection && <input type="hidden" name="section" value={discussionSection} />}
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
                      {discussionSection && <input type="hidden" name="section" value={discussionSection} />}
                      <button className="min-h-11 text-sm font-medium text-dams-hover underline">刷新入场状态</button>
                    </form>
                  )}
                </>
              )}
            </div>
          )}
        </section>
        <MeetupAgenda linkToDiscussion />
        <Link className="text-sm text-dams-hover underline" href="/summary/14">查看第 14 期复盘</Link>
      </div>
    </MeetupMemberLayout>
  )
}
