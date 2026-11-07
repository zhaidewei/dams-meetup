import { redirect } from 'next/navigation'
import { LATEST_SUMMARY_PATH } from '@/lib/meetup15/summary'

export function GET() {
  redirect(LATEST_SUMMARY_PATH)
}
