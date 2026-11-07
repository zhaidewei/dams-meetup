import { INTERACTION_END } from '../src/lib/meetup15/event'
import { getMember, MEMBER_COOKIE, requestCookie } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import type { ActivityEnv } from './activity'
import { readPollAdmin, readPollFeed, readPollScreen } from './polls-read'
import { writePoll, writeScreen } from './polls-write'

const headers = { 'Cache-Control': 'private, no-store' }

export async function handlePolls(request: Request, env: ActivityEnv, clock?: () => number) {
  const url = new URL(request.url)
  const view = url.pathname === '/api/polls' ? 'feed'
    : url.pathname === '/api/polls/admin' ? 'admin'
      : url.pathname === '/api/polls/screen' ? 'screen' : null
  if (!view) return new Response(null, { status: 404, headers })

  const now = clock?.() ?? Date.now()
  const member = view === 'feed' ? await getMember(env, requestCookie(request, MEMBER_COOKIE), now) : null
  const admin = view !== 'feed' && verifySessionCookie(ACTIVITY_ADMIN_COOKIE,
    requestCookie(request, ACTIVITY_ADMIN_COOKIE), env.SESSION_SECRET) === '1'
  if (!member && !admin) return Response.json({ error: '请重新登录后继续。' }, { status: 401, headers })

  const db = env.ACTIVITY_DB
  if (request.method === 'GET') {
    const data = member ? await readPollFeed(db, member, url, now)
      : view === 'admin' ? await readPollAdmin(db, now) : await readPollScreen(db, now)
    return Response.json(data, { headers })
  }
  if (request.method !== 'POST' || view === 'screen') return new Response(null, { status: 405, headers })
  if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403, headers })
  const input = await request.json<Record<string, unknown>>().catch(() => null)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return Response.json({ error: '请检查输入后重试。' }, { status: 400, headers })
  }
  const writeAt = clock?.() ?? Date.now()
  if (member && writeAt >= INTERACTION_END) {
    return Response.json({ error: '本届互动区已关闭。' }, { status: 409, headers })
  }
  const databaseTime = clock ? Math.floor(writeAt / 1000) : null
  const result = member ? await writePoll(db, member, input, databaseTime) : await writeScreen(db, input, databaseTime)
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status, headers })

  if (result.event) {
    try {
      await env.ACTIVITY_UPDATES.getByName('meetup-15-discussion').publish(result.event)
    } catch (error) {
      console.error('Poll update notification failed', error)
    }
  }
  return new Response(null, { status: 204, headers })
}
