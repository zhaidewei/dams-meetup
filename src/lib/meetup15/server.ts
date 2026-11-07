import 'server-only'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cookies } from 'next/headers'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../session-cookie-crypto'
import { meetupNow } from './event'
import { getMember, MEMBER_COOKIE, type MeetupEnv } from './identity'

export function meetupEnv() {
  return getCloudflareContext().env as MeetupEnv
}

export async function currentMember(now = meetupNow(meetupEnv())) {
  return getMember(meetupEnv(), (await cookies()).get(MEMBER_COOKIE)?.value, now)
}

export async function isMeetupAdmin() {
  const cookie = (await cookies()).get(ACTIVITY_ADMIN_COOKIE)?.value
  return verifySessionCookie(ACTIVITY_ADMIN_COOKIE, cookie, meetupEnv().SESSION_SECRET) === '1'
}
