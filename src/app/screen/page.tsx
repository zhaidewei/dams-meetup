import { redirect } from 'next/navigation'
import { MeetupScreen } from '@/components/meetup15/MeetupScreen'
import { isMeetupAdmin } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '现场大屏 · DAMS 第 15 期 Meetup' }

export default async function ScreenPage() {
  if (!await isMeetupAdmin()) redirect('/admin')
  return (
    <main className="grid min-h-svh content-center bg-zinc-950 px-5 py-10 text-center text-zinc-100">
      <MeetupScreen />
    </main>
  )
}
