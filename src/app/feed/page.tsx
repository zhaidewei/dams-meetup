import { redirect } from 'next/navigation'
import { DiscussionFeed } from '@/components/meetup15/DiscussionFeed'
import { MeetupNav } from '@/components/meetup15/MeetupAgenda'
import { currentMember } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '互动区 · DAMS 第 15 期 Meetup' }

export default async function FeedPage() {
  const member = await currentMember()
  if (!member) redirect('/')

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8">
      <MeetupNav />
      <h1 className="text-2xl font-semibold">第 15 期互动区</h1>
      <p role="status">{member.role === 'guest'
        ? `已作为嘉宾登录 · ${member.display_name}${member.title ? `，${member.title}` : ''}`
        : '你已入场，可以浏览活动内容。'}</p>
      <DiscussionFeed />
    </main>
  )
}
