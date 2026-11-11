import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LinkAdmission } from '@/components/meetup15/LinkAdmission'
import { meetupNow, meetupPhase } from '@/lib/meetup15/event'
import { meetupEnv } from '@/lib/meetup15/server'
import { LATEST_SUMMARY_PATH } from '@/lib/meetup15/summary'

export const dynamic = 'force-dynamic'

export default function RecoverPage() {
  if (meetupPhase(meetupNow(meetupEnv())) === 'closed') redirect(LATEST_SUMMARY_PATH)
  return (
    <main className="mx-4 my-6 w-auto sm:mx-auto sm:w-full max-w-md rounded-2xl border border-sky-100 bg-sky-50/60 space-y-4 px-5 py-7 sm:p-8">
      <h1 className="text-2xl font-semibold">恢复第 15 期观众身份</h1>
      <LinkAdmission mode="recover" />
      <p>请使用本届「恢复链接」页面保存的链接，并确认恢复身份。</p>
      <Link className="underline" href="/">返回活动首页</Link>
    </main>
  )
}
