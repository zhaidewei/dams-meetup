import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MeetupMemberLayout } from '@/components/meetup15/MeetupMemberNav'
import { MeetupPresence } from '@/components/meetup15/MeetupPresence'
import { RecoveryLink } from '@/components/meetup15/RecoveryLink'
import { recoveryPath } from '@/lib/meetup15/identity'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '恢复链接 · DAMS 第 15 期 Meetup' }

export default async function RecoveryLinkPage() {
  const member = await currentMember()
  if (!member) redirect('/')
  const secret = meetupEnv().SESSION_SECRET

  return (
    <MeetupMemberLayout active="/recovery-link">
      <div className="space-y-6 px-4 py-5 sm:px-6">
        <MeetupPresence />
        <header className="rounded-2xl bg-dams-wash p-5">
          <h1 className="text-2xl font-bold">恢复链接</h1>
        </header>
        <section className="space-y-3 rounded-2xl border border-dams-line bg-white p-5">
          {member.role === 'guest' ? (
            <p className="text-sm text-slate-700">
              换设备后，可使用同一个嘉宾用户名和密码
              <Link href="/vip-login" className="font-medium text-dams-blue underline">登录</Link>。
            </p>
          ) : secret ? <RecoveryLink path={recoveryPath(member.id, secret)} />
            : <p role="status" className="text-sm text-slate-700">暂时无法生成恢复链接。</p>}
        </section>
      </div>
    </MeetupMemberLayout>
  )
}
