import { MeetupMemberNav } from '@/components/meetup15/MeetupMemberNav'
import { redirect } from 'next/navigation'
import { MeetupNav } from '@/components/meetup15/MeetupAgenda'
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
  const messages = (await searchParams).view === 'messages'
  const secret = meetupEnv().SESSION_SECRET

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-5 pt-8 pb-24 md:pb-8">
      <MeetupPresence />
      <MeetupNav />
      <header className="rounded-2xl bg-sky-50 p-5"><h1 className="text-2xl font-bold">{messages ? '私信' : '我的'}</h1></header>
      <MeetupMemberNav active={messages ? '/me?view=messages' : '/me'} mobile />
      <PersonalPanel key={String(messages)} initialMessages={messages} />
      {member.role === 'attendee' && secret && <RecoveryLink path={recoveryPath(member.id, secret)} />}
      {member.role === 'guest' && <p>换设备后，可使用同一个嘉宾用户名和密码登录。</p>}
    </main>
  )
}
