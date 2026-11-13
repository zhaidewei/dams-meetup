import { getMember, MEMBER_COOKIE, requestCookie, type Member } from '../src/lib/meetup15/identity'
import { INTERACTION_END } from '../src/lib/meetup15/event'
import { MAX_DISCUSSION_BODY } from '../src/lib/meetup15/discussion'
import { MAX_CONTACT_LENGTH, MAX_NICKNAME_LENGTH, editableProfileFields, type PublicProfile } from '../src/lib/meetup15/personal'
import type { ActivityEnv } from './activity'
import { notifyDiscussion } from './discussion-notifications'
import { touchMember } from './meetup-presence'
import { memberCard, personalOverview, readThread, repliesRead, threadForMember } from './personal-read'

const headers = { 'Cache-Control': 'private, no-store' }
const failure = (status: number, error: string) => Response.json({ error }, { status, headers })
const missing = () => failure(404, '找不到成员或会话。')

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

async function notify(env: ActivityEnv, memberIds: string[]) {
  await Promise.allSettled(memberIds.map(id => env.ACTIVITY_UPDATES.getByName(`meetup-15-personal:${id}`).publish()))
}

async function updateProfile(db: D1Database, member: Member, input: Record<string, unknown>) {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const revision = input.revision
  if (!name || (name.length > MAX_NICKNAME_LENGTH && name !== member.display_name) ||
      typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    return failure(400, '请检查昵称。')
  }
  let statement: D1PreparedStatement
  if (input.publicProfile !== undefined) {
    if (!input.publicProfile || typeof input.publicProfile !== 'object' || Array.isArray(input.publicProfile) ||
        typeof input.removeLegacyContact !== 'boolean') return failure(400, '请检查公开资料。')
    const fields = input.publicProfile as Record<string, unknown>
    const profile: PublicProfile = {}
    for (const field of editableProfileFields(member.role === 'guest')) {
      const raw = fields[field.key]
      if (raw === undefined) continue
      if (typeof raw !== 'string') return failure(400, '请检查' + field.label + '。')
      const value = raw.trim()
      if (!value) continue
      if (value.length > field.maxLength || /[\x00-\x1f]/.test(value) ||
          (field.type === 'email' && !/^[^\s@]+@[^\s@]+$/.test(value))) {
        return failure(400, '请检查' + field.label + '。')
      }
      if (field.key === 'linkedin') {
        const url = URL.parse(value)
        if (!url || url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname) ||
            url.username || url.password) return failure(400, '请输入 HTTPS LinkedIn 链接。')
      }
      profile[field.key] = value
    }
    const { title, ...details } = profile
    const editTitle = member.role === 'guest' && fields.title !== undefined
    const remove = Number(input.removeLegacyContact)
    statement = db.prepare(`
      UPDATE meetup15_members SET display_name = ?, public_profile = ?,
        title = CASE WHEN ? THEN ? ELSE title END,
        contact = CASE WHEN ? = 1 THEN NULL ELSE contact END,
        contact_public = CASE WHEN ? = 1 THEN 0 ELSE contact_public END,
        profile_revision = profile_revision + 1 WHERE id = ? AND profile_revision = ?
    `).bind(name, JSON.stringify(details), Number(editTitle), title ?? null, remove, remove, member.id, revision)
  } else {
    // Older clients only edit the original contact field and its visibility.
    const contact = typeof input.contact === 'string' ? input.contact.trim() : null
    if (contact === null || contact.length > MAX_CONTACT_LENGTH || typeof input.contactPublic !== 'boolean') {
      return failure(400, '请检查联系方式。')
    }
    statement = db.prepare(`
      UPDATE meetup15_members SET display_name = ?, contact = ?, contact_public = ?, profile_revision = profile_revision + 1
      WHERE id = ? AND profile_revision = ?
    `).bind(name, contact || null, Number(Boolean(contact && input.contactPublic)), member.id, revision)
  }
  const result = await statement.run()
  if (!result.meta.changes) return failure(409, '资料已在其他设备修改，请核对后再保存。')
  return name !== member.display_name
}

export async function handlePersonal(request: Request, env: ActivityEnv, clock = Date.now) {
  const url = new URL(request.url)
  const now = clock()
  const member = await getMember(env, requestCookie(request, MEMBER_COOKIE), now)
  if (!member) return failure(401, '请重新入场后继续。')
  const db = env.ACTIVITY_DB
  if (url.pathname === '/api/personal/updates') {
    if (request.method !== 'GET') return failure(405, '不支持此操作。')
    if (request.headers.get('Origin') !== url.origin) return failure(403, '来源不正确。')
    return env.ACTIVITY_UPDATES.getByName(`meetup-15-personal:${member.id}`).fetch(request)
  }
  if (url.pathname === '/api/personal/presence') {
    if (request.method !== 'POST') return failure(405, '不支持此操作。')
    if (request.headers.get('Origin') !== url.origin) return failure(403, '来源不正确。')
    await touchMember(db, member.id, now)
    return new Response(null, { status: 204, headers })
  }
  if (url.pathname !== '/api/personal') return missing()

  const targetId = url.searchParams.get('member')
  const rawThread = url.searchParams.get('thread')
  const threadId = Number(rawThread)
  if (rawThread !== null && !positiveId(threadId)) return missing()
  const thread = rawThread === null ? null : await threadForMember(db, member.id, threadId)
  if (rawThread !== null && !thread) return missing()
  if (request.method === 'GET') {
    if (targetId !== null) {
      const card = await memberCard(db, member, targetId)
      return card ? Response.json({ ...card, named: Boolean(member.display_name), refreshAt: null }, { headers }) : missing()
    }
    const before = Number(url.searchParams.get('before'))
    const data = thread ? await readThread(db, member, thread, positiveId(before) ? before : Number.MAX_SAFE_INTEGER)
      : await personalOverview(db, member)
    return Response.json(data, { headers })
  }

  if (request.method !== 'POST') return failure(405, '不支持此操作。')
  if (request.headers.get('Origin') !== url.origin) return failure(403, '来源不正确。')
  const input = await request.json<Record<string, unknown>>().catch(() => null)
  if (!input || typeof input !== 'object' || Array.isArray(input)) return failure(400, '请检查输入后重试。')
  if (clock() >= INTERACTION_END) return failure(401, '本届互动区已关闭。')

  let renamed = false
  switch (input.action) {
    case 'profile': {
      const saved = await updateProfile(db, member, input)
      if (saved instanceof Response) return saved
      renamed = saved
      break
    }
    case 'replies-read':
      if (!positiveId(input.through)) return failure(400, '请刷新回复。')
      await repliesRead(db, member.id, input.through).run()
      break
    case 'thread-read':
    case 'thread-delete': {
      if (!thread || !positiveId(input.through)) return failure(400, '请刷新会话。')
      // 只记录此人已看到的消息位置。并发到达的新消息仍会显示。
      const cursor = input.action === 'thread-read' ? 'read_through' : 'hidden_through'
      await db.prepare(`
        INSERT INTO meetup15_dm_views (thread_id, member_id, ${cursor})
        SELECT ?, ?, COALESCE(MAX(id), 0) FROM meetup15_dm_messages WHERE thread_id = ? AND id <= ?
        ON CONFLICT (thread_id, member_id) DO UPDATE SET ${cursor} = MAX(${cursor}, excluded.${cursor})
      `).bind(thread.id, member.id, thread.id, input.through).run()
      break
    }
    case 'send': {
      if (!member.display_name) return failure(409, '请先在「我」填写昵称。')
      const body = typeof input.body === 'string' ? input.body.trim() : ''
      if (!body || Array.from(body).length > MAX_DISCUSSION_BODY) return failure(400, '请填写 1–300 字的私信。')
      const recipient = thread ? thread.peer : targetId
      if (!recipient || recipient === member.id || !await memberCard(db, member, recipient)) return missing()
      const [a, b] = [member.id, recipient].sort()
      await db.batch([
        db.prepare('INSERT INTO meetup15_dm_threads (member_a, member_b) VALUES (?, ?) ON CONFLICT (member_a, member_b) DO NOTHING').bind(a, b),
        db.prepare(`
          INSERT INTO meetup15_dm_messages (thread_id, sender_id, body)
          SELECT id, ?, ? FROM meetup15_dm_threads WHERE member_a = ? AND member_b = ?
        `).bind(member.id, body, a, b),
      ])
      await notify(env, [recipient, member.id])
      return new Response(null, { status: 204, headers })
    }
    default: return failure(400, '请检查输入后重试。')
  }
  const personalUpdate = notify(env, [member.id])
  if (renamed) await Promise.all([personalUpdate, notifyDiscussion(env)])
  else await personalUpdate
  return new Response(null, { status: 204, headers })
}
