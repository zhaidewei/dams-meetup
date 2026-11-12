import { redirect } from 'next/navigation'
import { meetupNow, meetupPhase } from '@/lib/meetup15/event'
import { meetupEnv } from '@/lib/meetup15/server'
import { LATEST_SUMMARY_PATH } from '@/lib/meetup15/summary'

export const dynamic = 'force-dynamic'

export default function AgendaPage() {
  if (meetupPhase(meetupNow(meetupEnv())) === 'closed') redirect(`${LATEST_SUMMARY_PATH}#agenda`)
  redirect('/#agenda')
}
