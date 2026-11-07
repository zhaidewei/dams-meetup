import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import type { FeedSnapshot, StaffSnapshot } from '../src/lib/meetup15/discussion'
import { MEMBER_COOKIE } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, signSessionCookie } from '../src/lib/session-cookie-crypto'

it('runs the discussion board and round-scoped Q&A with authenticated realtime updates', async () => {
  const now = Date.parse('2026-11-14T13:45:00+01:00')
  const origin = 'http://localhost'
  const path = origin + '/api/discussion'
  const secret = 'local-discussion-fixture-signing-key-only'
  const signed = (name: string, value: string, expires: number) =>
    `${name}=${signSessionCookie(name, value, new Date(expires), secret)}`
  const admin = signed(ACTIVITY_ADMIN_COOKIE, '1', Date.now() + 60_000)
  const alice = signed(MEMBER_COOKIE, 'alice', now + 60_000)
  const bob = signed(MEMBER_COOKIE, 'bob', now + 60_000)
  const bundle = await build({
    stdin: {
      contents: `
        import { handleDiscussion } from './cloudflare/meetup-discussion'
        export { ActivityUpdates } from './cloudflare/activity'
        export default { fetch: (request, env) => handleDiscussion(request, env, () => ${now}) }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], write: false,
  })
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'discussion.mjs', contents: bundle.outputFiles[0].text }],
    compatibilityDate: '2026-04-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACTIVITY_DB: 'fixture-discussion' },
    durableObjects: { ACTIVITY_UPDATES: { className: 'ActivityUpdates', useSQLite: true } },
    bindings: { SESSION_SECRET: secret },
  }))

  const read = (cookie: string, suffix = '') =>
    runtime.dispatchFetch(path + suffix, { headers: { Cookie: cookie } })
  const feed = async (cookie: string, query = '') => await (await read(cookie, query)).json() as FeedSnapshot
  const staff = async (view = 'admin') => await (await read(admin, '/' + view)).json() as StaffSnapshot
  const command = (cookie: string, input: object, suffix = '', from = origin) =>
    runtime.dispatchFetch(path + suffix, {
      method: 'POST', headers: { Cookie: cookie, Origin: from, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  const ok = async (cookie: string, input: object, suffix = '') =>
    expect((await command(cookie, input, suffix)).status).toBe(204)
  const connect = (cookie: string) => runtime.dispatchFetch(path + '/updates', {
    headers: { Cookie: cookie, Origin: origin, Upgrade: 'websocket' },
  })

  try {
    const db = await runtime.getD1Database('ACTIVITY_DB')
    for (const file of ['0001_activity_state.sql', '0002_meetup15_members.sql', '0003_meetup15_discussion.sql']) {
      const sql = await readFile('migrations/' + file, 'utf8')
      // 以语句起始词为分界，保留触发器内的分号。
      const statements = sql.trim().split(/;\s*\n(?=(?:CREATE|ALTER|INSERT)\b)/)
      await db.batch(statements.map((statement) => db.prepare(statement)))
    }
    await db.batch([
      db.prepare("INSERT INTO meetup15_members (id, role, display_name) VALUES ('alice','attendee','Alice')"),
      db.prepare("INSERT INTO meetup15_members (id, role) VALUES ('bob','attendee')"),
      db.prepare("INSERT INTO meetup15_members (id, role, display_name, username, password_hash) VALUES ('guest','guest','测试嘉宾','guest','fixture')"),
    ])

    expect((await read('')).status).toBe(401)
    expect((await read(alice, '/screen')).status).toBe(401)
    expect((await connect('')).status).toBe(401)
    expect((await command(alice, { action: 'section', section: 'expert' }, '/admin')).status).toBe(401)
    expect((await command(alice, { action: 'post' }, '', 'https://another.example')).status).toBe(403)
    expect((await feed(alice)).section).toBe('lightning')
    await ok(admin, { action: 'section', section: 'expert' }, '/admin')
    expect((await feed(alice)).section).toBe('expert')
    expect((await feed(alice, '?section=lounge')).section).toBe('lounge')

    expect((await command(bob, { action: 'post', section: 'expert', body: '未填昵称' })).status).toBe(403)
    expect((await command(alice, { action: 'post', section: 'expert', body: '字'.repeat(301) })).status).toBe(400)
    await ok(alice, { action: 'post', section: 'expert', body: '字'.repeat(300), tags: '#DAMS 问答' })
    const post = (await feed(alice)).items[0]
    expect(post.tags).toEqual(['dams', '问答'])
    await ok(bob, { action: 'like', id: post.id, liked: true })
    await ok(bob, { action: 'like', id: post.id, liked: true })
    expect((await feed(bob)).items[0]).toMatchObject({ likes: 1, liked: true, mine: false })
    expect((await command(bob, { action: 'delete', id: post.id })).status).toBe(409)
    await ok(bob, { action: 'nickname', name: 'Bob' })
    expect((await command(bob, { action: 'edit', id: post.id, body: '他人的帖子' })).status).toBe(409)
    await ok(bob, { action: 'reply', postId: post.id, parentId: null, body: '一级回复' })
    const reply = (await feed(bob)).items.find((item) => item.kind === 'reply')!
    await ok(alice, { action: 'reply', postId: post.id, parentId: reply.id, body: '子回复' })
    const child = (await feed(alice)).items.find((item) => item.parentId === reply.id)!
    expect((await command(bob, { action: 'reply', postId: post.id, parentId: child.id, body: '超深回复' })).status).toBe(409)
    await ok(alice, { action: 'edit', id: post.id, body: '已编辑的帖子', tags: '新标签' })
    await ok(bob, { action: 'edit', id: reply.id, body: '已编辑的回复' })
    expect((await feed(alice)).items.map((item) => item.body)).toContain('已编辑的回复')
    await ok(alice, { action: 'delete', id: child.id })
    await ok(bob, { action: 'delete', id: reply.id })
    await ok(alice, { action: 'delete', id: post.id })
    expect((await feed(alice)).items).toEqual([])

    await ok(admin, { action: 'start', guestId: 'guest', activeRoundId: null, latestRoundId: null }, '/admin')
    const first = (await staff()).activeRound!
    expect(first.section).toBe('expert')
    await ok(admin, { action: 'section', section: null }, '/admin')
    expect((await feed(alice)).section).toBe('lightning')
    expect((await feed(alice)).viewedRound).toBeNull()
    expect((await command(alice, {
      action: 'question', section: 'lightning', roundId: first.id, body: '错误板块',
    })).status).toBe(409)
    await ok(alice, { action: 'question', section: 'expert', roundId: first.id, body: '先问的问题' })
    await ok(bob, { action: 'question', section: 'expert', roundId: first.id, body: '后问的问题' })
    const [older, newer] = (await staff('screen')).questions
    expect([older.body, newer.body]).toEqual(['先问的问题', '后问的问题'])
    await ok(alice, { action: 'like', id: newer.id, liked: true })
    expect((await staff('screen')).questions[0].id).toBe(newer.id)

    const attendeeSocket = (await connect(alice)).webSocket!
    const screenSocket = (await connect(admin)).webSocket!
    attendeeSocket.accept()
    screenSocket.accept()
    const updates = Promise.all([attendeeSocket, screenSocket].map((socket) => new Promise((resolve) => {
      socket.addEventListener('message', (event) => resolve(event.data), { once: true })
    })))
    await ok(admin, { action: 'answer', id: newer.id, answered: true }, '/admin')
    await expect(updates).resolves.toEqual(['activity.updated', 'activity.updated'])
    const order = (snapshot: FeedSnapshot | StaffSnapshot) => snapshot.questions.map((q) => q.id)
    expect(order(await staff('screen'))).toEqual([older.id, newer.id])
    expect(order(await feed(alice, '?section=expert'))).toEqual([older.id, newer.id])
    await ok(admin, { action: 'answer', id: newer.id, answered: false }, '/admin')
    expect(order(await staff('screen'))).toEqual([newer.id, older.id])

    await ok(admin, { action: 'start', guestId: 'guest', activeRoundId: first.id, latestRoundId: first.id }, '/admin')
    expect((await command(admin, { action: 'start', guestId: 'guest', activeRoundId: first.id, latestRoundId: first.id }, '/admin')).status).toBe(409)
    const second = (await staff()).activeRound!
    expect(second).toMatchObject({ guest: first.guest, section: 'lightning' })
    expect(second.id).not.toBe(first.id)
    expect((await staff('screen')).questions).toEqual([])
    expect(order(await feed(alice, '?section=expert&round=' + first.id))).toEqual([newer.id, older.id])
    await ok(admin, { action: 'end', roundId: second.id }, '/admin')
    expect((await staff('screen')).activeRound).toBeNull()
    expect((await command(admin, { action: 'start', guestId: 'guest', activeRoundId: null, latestRoundId: null }, '/admin')).status).toBe(409)
    expect((await staff('screen')).rounds).toHaveLength(2)
    attendeeSocket.close(1000)
    screenSocket.close(1000)
  } finally {
    await runtime.dispose()
  }
}, 20_000)
