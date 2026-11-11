import { INTERACTION_END } from '../src/lib/meetup15/event'
import { getMember, MEMBER_COOKIE, requestCookie } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import type { ActivityEnv } from './activity'
import { readFeed, readDiscussionAdmin, readReplies } from './discussion-read'
import { writeMember, writeStaff } from './discussion-write'

const headers = { 'Cache-Control': 'private, no-store' }

export async function handleDiscussion(request: Request, env: ActivityEnv, clock = Date.now, execution?: ExecutionContext) {
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
    : path === '/api/discussion' ? 'feed' : path === '/api/discussion/replies' ? 'replies' : null
  if (!view) return new Response(null, { status: 404, headers })
  const member = view !== 'admin' ? await getMember(env, requestCookie(request, MEMBER_COOKIE), now) : null
  if (view !== 'admin' ? !member : !admin) {
    return Response.json({ error: '请重新登录后继续。' }, { status: 401, headers })
  }

  if (view === 'replies' && member) {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers })
    const post = Number(url.searchParams.get('post'))
    const parentValue = url.searchParams.get('parent')
    const parent = parentValue === null ? null : Number(parentValue)
    const after = Number(url.searchParams.get('after') ?? '0')
    if (!Number.isSafeInteger(post) || post < 1 ||
        (parent !== null && (!Number.isSafeInteger(parent) || parent < 1)) ||
        !Number.isSafeInteger(after) || after < 0) {
      return Response.json({ error: '回复分页参数无效。' }, { status: 400, headers })
    }
    return Response.json(await readReplies(db, member.id, post, parent, after), { headers })
  }

  if (request.method === 'GET') {
    const snapshot = member ? await readFeed(db, member, url, now, execution)
      : await readDiscussionAdmin(db, now)
    return Response.json(snapshot, { headers })
  }
  if (request.method !== 'POST') {
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
      await updates().queueDiscussionUpdate()
    } catch (error) {
      console.error('Discussion update notification failed', error)
    }
  }
  return new Response(null, { status: 204, headers })
}
