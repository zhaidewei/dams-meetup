import { FEED_VERSIONS_HEADER } from '../src/lib/meetup15/discussion'
import { INTERACTION_END } from '../src/lib/meetup15/event'
import { findMember, getMember, MEMBER_COOKIE, memberSessionId, requestCookie } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, readSessionCookie } from '../src/lib/session-cookie-crypto'
import type { ActivityEnv } from './activity'
import { readFeed, readDiscussionAdmin, readModerationPosts, readReplies } from './discussion-read'
import { deleteStaffPost, writeMember, writeStaff } from './discussion-write'

const headers = { 'Cache-Control': 'private, no-store' }
const denied = () => Response.json({ error: '请重新登录后继续。' }, { status: 401, headers })

export async function handleDiscussion(request: Request, env: ActivityEnv, clock = Date.now, execution?: ExecutionContext) {
  const url = new URL(request.url)
  const path = url.pathname
  const now = clock()
  const adminSession = readSessionCookie(ACTIVITY_ADMIN_COOKIE,
    requestCookie(request, ACTIVITY_ADMIN_COOKIE), env.SESSION_SECRET)
  const admin = adminSession?.value === '1'
  const db = env.ACTIVITY_DB
  const updates = () => env.ACTIVITY_UPDATES.getByName('meetup-15-discussion')

  if (path === '/api/discussion/updates') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers })
    if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403, headers })
    const mode = url.searchParams.get('qa')
    if (mode === 'projection' && !admin) return new Response(null, { status: 401, headers })
    const needsMember = mode === 'member' || !admin
    const session = !needsMember ? null : readSessionCookie(MEMBER_COOKIE,
      requestCookie(request, MEMBER_COOKIE), env.SESSION_SECRET, now)
    const member = session && now < INTERACTION_END ? await findMember(env, session.value) : null
    if (needsMember && !member) return new Response(null, { status: 401, headers })
    const forwarded = new Headers(request.headers)
    forwarded.delete('X-DAMS-QA-Session')
    if (mode === 'member' || mode === 'projection') {
      forwarded.set('X-DAMS-QA-Session', JSON.stringify({
        viewer: member?.id ?? '', expiresAt: session ? Math.min(session.expiresAt, INTERACTION_END) : adminSession!.expiresAt,
      }))
    }
    return updates().fetch(new Request(request, { headers: forwarded }))
  }

  const view = path === '/api/discussion/admin' ? 'admin'
    : path === '/api/discussion/admin/posts' ? 'moderation'
    : path === '/api/discussion' ? 'feed' : path === '/api/discussion/replies' ? 'replies' : null
  if (!view) return new Response(null, { status: 404, headers })
  const cookie = requestCookie(request, MEMBER_COOKIE)
  if (view === 'feed' && request.method === 'GET') {
    const viewer = memberSessionId(env, cookie, now)
    if (!viewer) return denied()
    const feed = await readFeed(db, viewer, url, now, request.headers.get(FEED_VERSIONS_HEADER), execution)
    if (!feed) return denied()
    const timing = Object.entries(feed.cache).flatMap(([name, status]) => status ? [`${name};desc="${status}"`] : [])
    return Response.json(feed.data, { headers: { ...headers, 'Server-Timing': timing.join(', ') } })
  }

  const staffView = view === 'admin' || view === 'moderation'
  const member = staffView ? null : await getMember(env, cookie, now)
  if (staffView ? !admin : !member) {
    return denied()
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
    const snapshot = view === 'moderation' ? await readModerationPosts(db, url, now)
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
  const result = view === 'moderation' ? await deleteStaffPost(db, input)
    : member ? await writeMember(db, member, input) : await writeStaff(db, input, writeAt)
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status, headers })

  if (result.changed) {
    const notify = Promise.resolve().then(() => updates().queueDiscussionUpdate(result.qa ? 'qa' : 'all'))
      .catch(error => console.error('Discussion update notification failed', error))
    if (execution) execution.waitUntil(notify)
    else await notify
  }
  if (result.ack && request.headers.has(FEED_VERSIONS_HEADER)) {
    return Response.json(result.ack, { headers })
  }
  return new Response(null, { status: 204, headers })
}
