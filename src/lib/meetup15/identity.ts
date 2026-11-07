/// <reference types="@cloudflare/workers-types" />

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { verifySessionCookie } from '../session-cookie-crypto'
import { ADMISSION_END, INTERACTION_END } from './event'

export const MEMBER_COOKIE = 'dams-meetup-15-member'

export type MeetupEnv = {
  ACTIVITY_DB: D1Database
  SESSION_SECRET?: string
}

export type Member = {
  id: string
  role: 'attendee' | 'guest'
  display_name: string | null
  title: string | null
}

export async function getMember(
  env: MeetupEnv, cookie: string | undefined, now = Date.now(),
): Promise<Member | null> {
  if (now >= INTERACTION_END) return null
  const id = verifySessionCookie(MEMBER_COOKIE, cookie, env.SESSION_SECRET, now)
  return id ? findMember(env, id) : null
}

export function findMember(env: MeetupEnv, id: string) {
  return env.ACTIVITY_DB.prepare('SELECT id, role, display_name, title FROM meetup15_members WHERE id = ?')
    .bind(id).first<Member>()
}

export async function isAdmissionOpen(env: MeetupEnv, now = Date.now()) {
  if (now >= ADMISSION_END) return false
  const row = await env.ACTIVITY_DB.prepare('SELECT admission_open FROM activity_state WHERE id = 1')
    .first<{ admission_open: number }>()
  return row?.admission_open === 1
}

function scopedToken(secret: string, purpose: string, value = '') {
  return createHmac('sha256', secret).update(`meetup-15:${purpose}:${value}`).digest('base64url')
}

export function admissionCredentials(secret: string) {
  // 48 位随机量，显示为 3 组，方便现场口头核对和手输。
  const hex = Buffer.from(scopedToken(secret, 'admission-password'), 'base64url')
    .subarray(0, 6).toString('hex').toUpperCase()
  return {
    password: `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8)}`,
    qr: scopedToken(secret, 'admission-qr'),
  }
}

export function recoveryPath(id: string, secret: string) {
  return `/recover#${new URLSearchParams({ u: id, t: scopedToken(secret, 'recover', id) })}`
}

export function matchesRecoveryToken(id: string, token: string, secret: string) {
  return equalSecret(token, scopedToken(secret, 'recover', id))
}

export function equalSecret(received: string, expected: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(received), digest(expected))
}

export function requestCookie(request: Request, name: string) {
  return request.headers.get('Cookie')?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}
