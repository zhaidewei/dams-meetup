import { INTERACTION_END } from '../src/lib/meetup15/event'
import { getMember, MEMBER_COOKIE, requestCookie } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import type { ActivityEnv } from './activity'
import { readFeed, readStaff } from './discussion-read'
import { writeMember, writeStaff } from './discussion-write'

const headers = { 'Cache-Control': 'private, no-store' }

export async function handleDiscussion(request: Request, env: ActivityEnv, clock = Date.now) {
  const url = new URL(request.url)
  const path = url.pathname
  const now = clock()
  const admin = verifySessionCookie(ACTIVITY_ADMIN_COOKIE,
    requestCookie(request, ACTIVITY_ADMIN_COOKIE), env.SESSION_SECRET) === '1'
  const db = env.ACTIVITY_DB
  const updates = () => env.ACTIVITY_UPDATES.getByName('meetup-15-discussion')

  if (path === '/api/discussion/updates') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers })
    if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403, headers })
    if (!admin && !await getMember(env, requestCookie(request, MEMBER_COOKIE), now)) {
      return new Response(null, { status: 401, headers })
    }
    return updates().fetch(request)
  }

  const view = path === '/api/discussion/admin' ? 'admin'
    : path === '/api/discussion/screen' ? 'screen'
      : path === '/api/discussion' ? 'feed' : null
  if (!view) return new Response(null, { status: 404, headers })
  const member = view === 'feed' ? await getMember(env, requestCookie(request, MEMBER_COOKIE), now) : null
  if (view === 'feed' ? !member : !admin) {
    return Response.json({ error: '请重新登录后继续。' }, { status: 401, headers })
  }

  if (request.method === 'GET') {
    if (member) {
      const seenAt = Math.floor(now / 1000)
      await db.prepare('UPDATE meetup15_members SET last_seen_at = ? WHERE id = ? AND COALESCE(last_seen_at, 0) <= ?')
        .bind(seenAt, member.id, seenAt - 30).run()
    }
    const snapshot = member ? await readFeed(db, member, url, now)
      : await readStaff(db, now, view === 'admin' ? 'admin' : 'screen')
    return Response.json(snapshot, { headers })
  }
  if (request.method !== 'POST' || view === 'screen') {
    return new Response(null, { status: 405, headers })
  }
  if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403, headers })
  const input = await request.json<Record<string, unknown>>().catch(() => null)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return Response.json({ error: '请检查输入后重试。' }, { status: 400, headers })
  }
  const writeAt = clock()
  if (writeAt >= INTERACTION_END) return Response.json({ error: '本届互动区已关闭。' }, { status: 409, headers })
  const result = member ? await writeMember(db, member, input) : await writeStaff(db, input, writeAt)
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status, headers })

  if (result.changed) {
    try {
      await updates().publish()
    } catch (error) {
      console.error('Discussion update notification failed', error)
    }
  }
  return new Response(null, { status: 204, headers })
}
