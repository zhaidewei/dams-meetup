import { createHash, timingSafeEqual } from 'node:crypto'
import { ACTIVITY_ADMIN_COOKIE, signSessionCookie } from '../src/lib/session-cookie-crypto'

const SESSION_LENGTH_MS = 12 * 60 * 60 * 1000
const ADMIN_PAGE = '/admin/activity'

export async function loginActivityAdmin(
  request: Request,
  env: { ADMIN_TOKEN?: string; SESSION_SECRET?: string; ACTIVITY_LOGIN_LIMIT: RateLimit },
): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    return new Response(null, { status: 403 })
  }

  if (!env.ADMIN_TOKEN || !env.SESSION_SECRET) return new Response(null, { status: 503 })

  const { success } = await env.ACTIVITY_LOGIN_LIMIT.limit({
    key: request.headers.get('CF-Connecting-IP') ?? 'unknown',
  })
  if (!success) return new Response('登录尝试过多，请稍后再试。', {
    status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' },
  })

  const submitted = (await request.formData().catch(() => null))?.get('token')
  const digest = (value: string) => createHash('sha256').update(value).digest()
  const valid = typeof submitted === 'string' &&
    timingSafeEqual(digest(submitted), digest(env.ADMIN_TOKEN))
  const headers = new Headers({ Location: ADMIN_PAGE, 'Cache-Control': 'no-store' })
  if (!valid) {
    headers.set('Location', `${ADMIN_PAGE}?error=1`)
  } else {
    const expires = new Date(Date.now() + SESSION_LENGTH_MS)
    const cookie = signSessionCookie(ACTIVITY_ADMIN_COOKIE, '1', expires, env.SESSION_SECRET)
    headers.set('Set-Cookie',
      `${ACTIVITY_ADMIN_COOKIE}=${cookie}; Path=/; Expires=${expires.toUTCString()}; Secure; HttpOnly; SameSite=Lax`)
  }

  return new Response(null, { status: 303, headers })
}
