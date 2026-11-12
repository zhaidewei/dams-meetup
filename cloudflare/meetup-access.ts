import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { ACTIVITY_ADMIN_COOKIE, signSessionCookie, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import { ADMISSION_END, INTERACTION_END, isMeetupSection, meetupDiscussionPath } from '../src/lib/meetup15/event'
import {
  admissionCredentials, equalSecret, findMember, getMember, isAdmissionOpen,
  matchesRecoveryToken, MEMBER_COOKIE, requestCookie,
} from '../src/lib/meetup15/identity'
import type { ActivityEnv } from './activity'
import { notifyDiscussion } from './discussion-notifications'

const noStore = { 'Cache-Control': 'private, no-store' }

function redirect(path: string) {
  return new Response(null, { status: 303, headers: { ...noStore, Location: path } })
}

function memberRedirect(id: string, secret: string, destination = '/feed') {
  const expires = new Date(INTERACTION_END)
  const signed = signSessionCookie(MEMBER_COOKIE, id, expires, secret)
  const response = redirect(destination)
  response.headers.set('Set-Cookie',
    `${MEMBER_COOKIE}=${signed}; Path=/; Expires=${expires.toUTCString()}; Secure; HttpOnly; SameSite=Lax`)
  return response
}

function field(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

function guestHash(password: string, salt: string) {
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 })
    .toString('hex')
}

async function registerGuest(form: FormData, env: ActivityEnv) {
  const username = field(form, 'username').trim().toLowerCase()
  const displayName = field(form, 'displayName').trim()
  const title = field(form, 'title').trim()
  const password = field(form, 'password')
  const action = field(form, 'action')
  const editing = action === 'edit'
  const creating = action === 'create'
  const invalid = editing ? '/admin/activity?tab=guests&guest=invalid&edit=' + encodeURIComponent(username) : '/admin/activity?guest=invalid'
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ||
      !displayName || displayName.length > 80 || title.length > 120 ||
      ((!editing || password) && (password.length < 12 || password.length > 128))) {
    return redirect(invalid)
  }
  if (editing) {
    const salt = password ? randomBytes(16).toString('hex') : null
    const hash = salt ? `${salt}:${guestHash(password, salt)}` : null
    const saved = await env.ACTIVITY_DB.prepare(`
      UPDATE meetup15_members
      SET display_name = ?, title = ?, password_hash = COALESCE(?, password_hash)
      WHERE username = ? AND role = 'guest'
        AND NOT EXISTS (SELECT 1 FROM meetup15_summary WHERE cleaned_at IS NOT NULL)
    `).bind(displayName, title || null, hash, username).run()
    if (!saved.meta.changes) return redirect(invalid)
    await notifyDiscussion(env)
    return redirect('/admin/activity?guest=saved')
  }
  const salt = randomBytes(16).toString('hex')
  const saved = await env.ACTIVITY_DB.prepare(
    `INSERT INTO meetup15_members (id, role, display_name, title, username, password_hash)
     SELECT ?, 'guest', ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM meetup15_summary WHERE cleaned_at IS NOT NULL)
     ON CONFLICT (username) DO UPDATE SET
       display_name = excluded.display_name, title = excluded.title, password_hash = excluded.password_hash
     WHERE ?`,
  ).bind(randomUUID(), displayName, title || null, username, `${salt}:${guestHash(password, salt)}`, Number(!creating)).run()
  if (saved.meta.changes) {
    await notifyDiscussion(env)
    return redirect('/admin/activity?guest=saved')
  }
  if (creating && await env.ACTIVITY_DB.prepare(
    'SELECT 1 FROM meetup15_members WHERE username = ?',
  ).bind(username).first()) return redirect('/admin/activity?guest=duplicate')
  return redirect('/?entry=ended')
}

async function loginGuest(form: FormData, env: ActivityEnv, secret: string) {
  const username = field(form, 'username').trim().toLowerCase()
  const password = field(form, 'password')
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || !password || password.length > 128) {
    return redirect('/vip-login?error=1')
  }
  const guest = await env.ACTIVITY_DB.prepare(
    "SELECT id, password_hash FROM meetup15_members WHERE role = 'guest' AND username = ?",
  ).bind(username).first<{ id: string; password_hash: string }>()
  const [salt, expected] = guest?.password_hash.split(':') ?? ['0'.repeat(32), '0'.repeat(64)]
  const valid = equalSecret(guestHash(password, salt), expected)
  return guest && valid ? memberRedirect(guest.id, secret) : redirect('/vip-login?error=1')
}

async function enter(
  form: FormData, env: ActivityEnv, secret: string, request: Request, now: number,
) {
  const section = field(form, 'section')
  const discussionSection = isMeetupSection(section) ? section : undefined
  const destination = meetupDiscussionPath(discussionSection)
  const admissionError = (entry: 'closed' | 'invalid') => redirect(discussionSection
    ? `/?entry=${entry}&section=${discussionSection}#entry-title` : `/?entry=${entry}`)
  const existing = await getMember(env, requestCookie(request, MEMBER_COOKIE), now)
  if (existing) return redirect(destination)
  if (!await isAdmissionOpen(env, now)) return admissionError('closed')
  const method = field(form, 'method')
  const value = field(form, 'credential')
  const { password, qr } = admissionCredentials(secret)
  const valid = method === 'qr' ? equalSecret(value, qr) :
    method === 'password' && equalSecret(value.replace(/[\s-]/g, '').toUpperCase(), password.replaceAll('-', ''))
  if (!valid) return admissionError('invalid')

  // 插入时同时检查手动开关和数据库当前时间，覆盖关闸或跨截止时间的在途请求。
  const member = await env.ACTIVITY_DB.prepare(
    `INSERT INTO meetup15_members (id, role)
     SELECT ?, 'attendee' FROM activity_state
     WHERE id = 1 AND admission_open = 1 AND unixepoch() < ?
     RETURNING id`,
  ).bind(randomUUID(), ADMISSION_END / 1000).first<{ id: string }>()
  return member ? memberRedirect(member.id, secret, destination) : admissionError('closed')
}

export async function handleMeetupAccess(request: Request, env: ActivityEnv, clock = Date.now) {
  const url = new URL(request.url)
  const action = url.pathname.slice('/api/meetup/'.length)
  const secret = env.SESSION_SECRET
  const admin = verifySessionCookie(ACTIVITY_ADMIN_COOKIE,
    requestCookie(request, ACTIVITY_ADMIN_COOKIE), secret) === '1'

  if (action === 'screen') {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    if (!admin || !secret) return new Response(null, { status: 401, headers: noStore })
    if (!await isAdmissionOpen(env, clock())) return Response.json({ open: false }, { headers: noStore })
    const { password, qr } = admissionCredentials(secret)
    const qrPath = `/auto-login#${new URLSearchParams({ qr })}`
    return Response.json({ open: true, password, qrPath }, { headers: noStore })
  }

  if (!['enter', 'recover', 'guest-login', 'guests'].includes(action)) {
    return new Response(null, { status: 404 })
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 })
  if (action === 'guests' && !admin) return new Response(null, { status: 401 })
  if (!secret) return new Response(null, { status: 503 })
  if (clock() >= INTERACTION_END) return redirect('/?entry=ended')

  if (action !== 'guests') {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const limiter = action === 'enter' ? env.ACTIVITY_ENTRY_LIMIT : env.ACTIVITY_LOGIN_LIMIT
    const { success } = await limiter.limit({ key: `${action}:${ip}` })
    if (!success) return new Response('尝试过多，请稍后再试。', {
      status: 429, headers: { ...noStore, 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' },
    })
  }
  const form = await request.formData().catch(() => null)
  if (!form) return new Response(null, { status: 400 })
  const now = clock()
  if (now >= INTERACTION_END) return redirect('/?entry=ended')
  if (action === 'guests') return registerGuest(form, env)
  if (action === 'guest-login') return loginGuest(form, env, secret)
  if (action === 'enter') return enter(form, env, secret, request, now)

  const id = field(form, 'id')
  const token = field(form, 'token')
  if (!/^[\da-f-]{36}$/.test(id) || token.length !== 43 || !matchesRecoveryToken(id, token, secret)) {
    return redirect('/?entry=recovery')
  }
  const existing = await getMember(env, requestCookie(request, MEMBER_COOKIE), now)
  if (existing) return redirect(existing.id === id ? '/feed' : '/?entry=already')
  const member = await findMember(env, id)
  return member?.role === 'attendee' ? memberRedirect(id, secret) : redirect('/?entry=recovery')
}
