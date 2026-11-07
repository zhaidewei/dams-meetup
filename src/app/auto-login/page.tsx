import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LinkAdmission } from '@/components/meetup15/LinkAdmission'
import { meetupNow, meetupPhase } from '@/lib/meetup15/event'
import { meetupEnv } from '@/lib/meetup15/server'
import { LATEST_SUMMARY_PATH } from '@/lib/meetup15/summary'

export const dynamic = 'force-dynamic'

export default function ScanPage() {
  const phase = meetupPhase(meetupNow(meetupEnv()))
  if (phase === 'closed') redirect(LATEST_SUMMARY_PATH)
  if (phase === 'recovery') redirect('/')
  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-5 py-12">
      <h1 className="text-2xl font-semibold">第 15 期扫码入场</h1>
      <LinkAdmission mode="qr" />
      <p>如果页面没有自动跳转，请扫描本届现场大屏上的二维码。</p>
      <Link className="underline" href="/">返回活动首页</Link>
    </main>
  )
}
