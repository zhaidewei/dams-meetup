import { redirect } from 'next/navigation'
import { MeetupNav } from '@/components/meetup15/MeetupAgenda'
import { RecoveryLink } from '@/components/meetup15/RecoveryLink'
import { recoveryPath } from '@/lib/meetup15/identity'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '我 · DAMS 第 15 期 Meetup' }

export default async function MePage() {
  const member = await currentMember()
  if (!member) redirect('/')
  const secret = meetupEnv().SESSION_SECRET

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8">
      <MeetupNav />
      <h1 className="text-2xl font-semibold">我</h1>
      <p>{member.role === 'guest' ? `${member.display_name} · 嘉宾` : '第 15 期观众'}</p>
      {member.role === 'attendee' && secret && <RecoveryLink path={recoveryPath(member.id, secret)} />}
      {member.role === 'guest' && <p>换设备后，可使用同一个嘉宾用户名和密码登录。</p>}
    </main>
  )
}
