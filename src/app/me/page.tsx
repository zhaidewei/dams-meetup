import { MeetupMemberLayout } from '@/components/meetup15/MeetupMemberNav'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { MeetupPresence } from '@/components/meetup15/MeetupPresence'
import { PersonalPanel } from '@/components/meetup15/PersonalPanel'
import { RecoveryLink } from '@/components/meetup15/RecoveryLink'
import { recoveryPath } from '@/lib/meetup15/identity'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '我 · DAMS 第 15 期 Meetup' }

export default async function MePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const member = await currentMember()
  if (!member) redirect('/')
  const { view } = await searchParams
  const initialView = view === 'messages' || view === 'recovery' ? view : 'profile'
  const secret = meetupEnv().SESSION_SECRET

  return (
    <MeetupMemberLayout active="/me">
      <div className="space-y-5 px-4 py-3 sm:px-6">
        <MeetupPresence />
        <h1 className="sr-only">我的</h1>
        <PersonalPanel key={initialView} initialView={initialView} recovery={(
          <section aria-label="恢复链接" className="max-w-lg rounded-2xl border border-dams-line bg-white p-4">
            {member.role === 'guest' ? (
              <p className="text-sm text-slate-700">
                换设备后，可使用同一个嘉宾用户名和密码
                <Link href="/vip-login" className="font-medium text-dams-blue underline">登录</Link>。
              </p>
            ) : secret ? <RecoveryLink path={recoveryPath(member.id, secret)} /> : (
              <p role="status" className="text-sm text-slate-700">暂时无法生成恢复链接。</p>
            )}
          </section>
        )} />
      </div>
    </MeetupMemberLayout>
  )
}
