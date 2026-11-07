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
    <main className="mx-auto w-full max-w-md space-y-4 px-5 py-12">
      <h1 className="text-2xl font-semibold">恢复第 15 期观众身份</h1>
      <LinkAdmission mode="recover" />
      <p>请使用本届「我」页面保存的链接，并确认恢复身份。</p>
      <Link className="underline" href="/">返回活动首页</Link>
    </main>
  )
}
