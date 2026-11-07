import { redirect } from 'next/navigation'
import { AdmissionScreen } from '@/components/meetup15/AdmissionScreen'
import { MEETUP_NAME, MEETUP_THEME } from '@/lib/meetup15/event'
import { isMeetupAdmin } from '@/lib/meetup15/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: '现场大屏 · DAMS 第 15 期 Meetup' }

export default async function ScreenPage() {
  if (!await isMeetupAdmin()) redirect('/admin')
  return (
    <main className="grid min-h-svh place-content-center bg-zinc-950 px-5 py-10 text-center text-zinc-100">
      <div className="space-y-7">
        <p className="text-lg">{MEETUP_NAME}</p>
        <h1 className="text-3xl font-semibold md:text-6xl">{MEETUP_THEME}</h1>
        <AdmissionScreen />
      </div>
    </main>
  )
}
