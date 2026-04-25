import 'server-only'
import { cookies } from 'next/headers'
import { getServerSupabase } from './supabase/server'
import { cookieExpiresAt } from './constants'
import type { UserRow } from './types'

export const COOKIE_UID = 'dams-uid'
export const COOKIE_PW = 'dams-pw-ok'

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: cookieExpiresAt(),
  }
}

export async function readUidCookie(): Promise<string | null> {
  const c = await cookies()
  return c.get(COOKIE_UID)?.value ?? null
}

export async function readPwCookie(): Promise<boolean> {
  const c = await cookies()
  return Boolean(c.get(COOKIE_PW)?.value)
}

export async function setPwCookie() {
  const c = await cookies()
  c.set(COOKIE_PW, '1', cookieOpts())
}

export async function setUidCookie(uid: string) {
  const c = await cookies()
  c.set(COOKIE_UID, uid, cookieOpts())
}

export async function clearAllCookies() {
  const c = await cookies()
  c.delete(COOKIE_UID)
  c.delete(COOKIE_PW)
}

// Reads the current user (or null). Server-only.
export async function getCurrentUser(): Promise<UserRow | null> {
  const uid = await readUidCookie()
  if (!uid) return null
  const sb = getServerSupabase()
  const { data } = await sb.from('users').select('*').eq('id', uid).maybeSingle()
  return (data as UserRow | null) ?? null
}

// Ensures a user row exists for this browser. Creates one if needed and
// sets the UID cookie. Must be called from a Server Action or Route Handler
// (cookies().set() is not allowed in plain Server Components).
export async function ensureUser(): Promise<UserRow> {
  const existing = await getCurrentUser()
  if (existing) return existing
  const sb = getServerSupabase()
  const { data, error } = await sb.from('users').insert({}).select().single()
  if (error || !data) throw new Error(`failed to create user: ${error?.message}`)
  await setUidCookie(data.id)
  return data as UserRow
}

// Recovery flow: validate (uuid, recovery_token) pair and set cookies.
// Returns the user if valid, null otherwise.
export async function recoverUser(uid: string, token: string): Promise<UserRow | null> {
  const sb = getServerSupabase()
  const { data } = await sb
    .from('users')
    .select('*')
    .eq('id', uid)
    .eq('recovery_token', token)
    .maybeSingle()
  if (!data) return null
  await setUidCookie(data.id)
  await setPwCookie()
  return data as UserRow
}
