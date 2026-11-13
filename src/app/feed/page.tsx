import { redirect } from 'next/navigation'
import { DiscussionFeed } from '@/components/meetup15/DiscussionFeed'
import { GuestVipBadge } from '@/components/meetup15/GuestVipBadge'
import { MeetupMemberLayout } from '@/components/meetup15/MeetupMemberNav'
import { MeetupPresence } from '@/components/meetup15/MeetupPresence'
import { isMeetupSection, meetupNow } from '@/lib/meetup15/event'
import { currentMember, meetupEnv } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '讨论区 · DAMS 第 15 期 Meetup' }

export default async function FeedPage({ searchParams }: {
  searchParams: Promise<{ view?: string; section?: string; ask?: string }>
}) {
  const now = meetupNow(meetupEnv())
  const member = await currentMember(now)
  const { view, section, ask } = await searchParams
  const free = view === 'free'
  const initialSection = !free && isMeetupSection(section) && section !== 'lounge' ? section : null
  if (!member) {
    const params = new URLSearchParams({ entry: 'join' })
    if (free || initialSection) params.set('section', initialSection ?? 'lounge')
    redirect(`/?${params}#entry-title`)
  }

  return (
    <MeetupMemberLayout active={free ? '/feed?view=free' : '/feed'}>
      <MeetupPresence />
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{free ? '自由讨论区' : '议程讨论区'}</h1>
          <p className="text-xs text-slate-600">荷兰华人数据社群 · 第 15 期 Meetup</p>
        </div>
        {member.role === 'guest' && <GuestVipBadge />}
      </header>
      <DiscussionFeed key={free ? 'free' : initialSection ?? 'follow'} free={free} initialAsk={ask === '1'} memberId={member.id} />
    </MeetupMemberLayout>
  )
}
