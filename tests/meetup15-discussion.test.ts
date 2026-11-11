import { readFile, readdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import type { FeedSnapshot, ReplyPage, StaffSnapshot } from '../src/lib/meetup15/discussion'
import type { ProjectionAdminSnapshot, ProjectionView } from '../src/lib/meetup15/projection'
import { MEETUP_BREAKOUT_GROUPS } from '../src/lib/meetup15/event'
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
  const guest = signed(MEMBER_COOKIE, 'guest', now + 60_000)
  const bundle = await build({
    stdin: {
      contents: `
        import { handleDiscussion } from './cloudflare/meetup-discussion'
        import { handleProjection } from './cloudflare/meetup-projection'
        export { ActivityUpdates } from './cloudflare/activity'
        export default { fetch(request, env) {
          const handle = new URL(request.url).pathname.startsWith('/api/screen') ? handleProjection : handleDiscussion
          return handle(request, env, () => ${now})
        } }
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
  const replies = async (cookie: string, post: number, parent?: number, after = 0) => {
    const query = new URLSearchParams({ post: String(post), after: String(after) })
    if (parent !== undefined) query.set('parent', String(parent))
    const response = await read(cookie, '/replies?' + query)
    expect(response.status).toBe(200)
    return await response.json() as ReplyPage
  }
  const staff = async () => await (await read(admin, '/admin')).json() as StaffSnapshot
  const readScreen = (cookie: string) => runtime.dispatchFetch(origin + '/api/screen', { headers: { Cookie: cookie } })
  const screen = async () => await (await readScreen(admin)).json() as ProjectionView
  const projection = async () => await (await runtime.dispatchFetch(origin + '/api/screen/admin', {
    headers: { Cookie: admin },
  })).json() as ProjectionAdminSnapshot
  const preview = (query: string, cookie = admin) => runtime.dispatchFetch(origin + '/api/screen/preview?' + query, {
    headers: { Cookie: cookie },
  })
  const switchScreen = (input: object, cookie = admin, from = origin) => runtime.dispatchFetch(origin + '/api/screen/admin', {
    method: 'POST', headers: { Cookie: cookie, Origin: from, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const activeQa = async () => {
    const snapshot = await screen()
    if (snapshot.mode !== 'qa') throw new Error('Expected Q&A on the projection')
    return snapshot
  }
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
    for (const file of (await readdir('migrations')).sort()) {
      const sql = await readFile('migrations/' + file, 'utf8')
      // 以语句起始词为分界，保留触发器内的分号。
      const statements = sql.trim().split(/;\s*\n(?=(?:CREATE|ALTER|INSERT|UPDATE|DROP)\b)/)
      await db.batch(statements.map((statement) => db.prepare(statement)))
    }
    await db.batch([
      db.prepare("INSERT INTO meetup15_members (id, role, display_name) VALUES ('alice','attendee','Alice')"),
      db.prepare("INSERT INTO meetup15_members (id, role) VALUES ('bob','attendee')"),
      db.prepare("INSERT INTO meetup15_members (id, role, display_name, username, password_hash) VALUES ('guest','guest','测试嘉宾','guest','fixture')"),
    ])

    expect((await read('')).status).toBe(401)
    expect((await readScreen(alice)).status).toBe(401)
    expect((await screen()).mode).toBe('hidden')
    expect((await projection()).rounds).toEqual([])
    expect((await preview('mode=agenda', alice)).status).toBe(401)
    expect((await switchScreen({ mode: 'agenda', revision: 0 }, alice)).status).toBe(401)
    expect((await switchScreen({ mode: 'agenda', revision: 0 }, admin, 'https://other.example')).status).toBe(403)
    expect((await preview('mode=agenda')).status).toBe(200)
    expect((await screen()).mode).toBe('hidden')
    expect((await switchScreen({ mode: 'agenda', revision: 0 })).status).toBe(204)
    expect(await screen()).toMatchObject({ mode: 'agenda', currentStart: '13:30' })
    expect((await switchScreen({ mode: 'raffle', revision: 0 })).status).toBe(409)
    expect((await screen()).mode).toBe('agenda')
    expect((await read(admin, '/screen')).status).toBe(404)
    expect((await connect('')).status).toBe(401)
    expect((await command(alice, { action: 'section', section: 'expert' }, '/admin')).status).toBe(401)
    expect((await command(alice, { action: 'post' }, '', 'https://another.example')).status).toBe(403)
    expect((await feed(alice)).section).toBe('lightning')
    await ok(admin, { action: 'section', section: 'expert' }, '/admin')
    expect((await feed(alice)).section).toBe('expert')
    expect((await feed(alice, '?section=lounge')).section).toBe('lounge')

    await ok(admin, { action: 'section', section: 'breakout' }, '/admin')
    await ok(alice, { action: 'post', section: 'breakout', body: '分组公共交流' })
    const groups = Object.entries(MEETUP_BREAKOUT_GROUPS)
    for (const [section, body] of groups) {
      await ok(alice, { action: 'post', section, body })
    }
    for (const [section, body] of groups) {
      const snapshot = await feed(alice, '?section=' + section)
      expect(snapshot.section).toBe(section)
      expect(snapshot.currentSection).toBe('breakout')
      expect(snapshot.items.map((item) => item.body)).toEqual([body])
      const postId = snapshot.items[0].id
      await ok(guest, { action: 'reply', postId, parentId: null, body: '回复 · ' + body })
      expect((await replies(alice, postId)).items.map((item) => item.body)).toEqual(['回复 · ' + body])
      expect((await feed(alice, '?section=' + section)).items[0].replyCount).toBe(1)
    }
    expect((await feed(alice)).items.map((item) => item.body)).toEqual(['分组公共交流'])
    expect((await command(admin, { action: 'section', section: groups[0][0] }, '/admin')).status).toBe(400)
    await ok(admin, { action: 'section', section: 'expert' }, '/admin')

    expect((await command(bob, { action: 'post', section: 'expert', body: '未填昵称' })).status).toBe(403)
    expect((await command(alice, { action: 'post', section: 'expert', body: '字'.repeat(301) })).status).toBe(400)
    await ok(alice, { action: 'post', section: 'expert', body: '字'.repeat(300), tags: '#DAMS 问答' })
    const post = (await feed(alice)).items[0]
    expect(post).toMatchObject({ tags: ['dams', '问答'], authorRole: 'attendee' })
    await ok(guest, { action: 'post', section: 'lounge', body: '嘉宾讨论帖' })
    expect((await feed(alice, '?section=lounge')).items).toMatchObject([
      { authorId: 'guest', authorRole: 'guest', mine: false },
    ])
    await ok(bob, { action: 'like', id: post.id, liked: true })
    await ok(bob, { action: 'like', id: post.id, liked: true })
    expect((await feed(bob)).items[0]).toMatchObject({ likes: 1, liked: true, mine: false })
    expect((await command(bob, { action: 'delete', id: post.id })).status).toBe(409)
    await ok(bob, { action: 'nickname', name: 'Bob' })
    expect((await command(bob, { action: 'edit', id: post.id, body: '他人的帖子' })).status).toBe(409)
    await ok(bob, { action: 'reply', postId: post.id, parentId: null, body: '一级回复' })
    const reply = (await replies(bob, post.id)).items[0]
    expect((await feed(alice)).items).toMatchObject([{ id: post.id, kind: 'post', replyCount: 1 }])
    expect((await read('', '/replies?post=' + post.id)).status).toBe(401)
    expect((await read(alice, '/replies?post=' + post.id + '&after=-1')).status).toBe(400)
    const reaction = { action: 'reaction', id: reply.id, emoji: '👍', reacted: true }
    const replyReactions = async (cookie: string) => (await replies(cookie, post.id)).items.find(item => item.id === reply.id)?.reactions
    expect(await replyReactions(alice)).toEqual([])
    expect((await command('', reaction)).status).toBe(401)
    expect((await command(alice, { ...reaction, emoji: 'x' })).status).toBe(400)
    await ok(alice, { ...reaction, id: post.id, emoji: '🎉' })
    expect((await feed(alice)).items[0]).toMatchObject({
      likes: 1, liked: false, reactions: [{ emoji: '🎉', count: 1, reacted: true }],
    })
    expect((await feed(bob)).items[0]).toMatchObject({
      likes: 1, liked: true, reactions: [{ emoji: '🎉', count: 1, reacted: false }],
    })
    const observer = (await connect(alice)).webSocket!
    observer.accept()
    const reactionUpdate = new Promise(resolve => {
      observer.addEventListener('message', event => resolve(event.data), { once: true })
    })
    await ok(bob, reaction)
    await expect(reactionUpdate).resolves.toBe('activity.updated')
    observer.close(1000)
    expect(await replyReactions(alice)).toEqual([{ emoji: '👍', count: 1, reacted: false }])
    await ok(alice, reaction)
    await ok(alice, reaction)
    expect(await replyReactions(bob)).toEqual([{ emoji: '👍', count: 2, reacted: true }])
    await ok(alice, { ...reaction, reacted: false, memberId: 'bob' })
    expect(await replyReactions(alice)).toEqual([{ emoji: '👍', count: 1, reacted: false }])
    expect(await replyReactions(bob)).toEqual([{ emoji: '👍', count: 1, reacted: true }])
    await ok(alice, { action: 'reply', postId: post.id, parentId: reply.id, body: '子回复' })
    const child = (await replies(alice, post.id, reply.id)).items[0]
    expect((await command(bob, { action: 'reply', postId: post.id, parentId: child.id, body: '超深回复' })).status).toBe(409)
    await ok(alice, { action: 'edit', id: post.id, body: '已编辑的帖子', tags: '新标签' })
    await ok(bob, { action: 'edit', id: reply.id, body: '已编辑的回复' })
    expect((await replies(alice, post.id)).items.map((item) => item.body)).toContain('已编辑的回复')
    for (let index = 0; index < 11; index++) {
      await ok(alice, { action: 'reply', postId: post.id, parentId: null, body: '分页回复 ' + index })
      await ok(alice, { action: 'reply', postId: post.id, parentId: reply.id, body: '分页子回复 ' + index })
    }
    for (const parent of [undefined, reply.id]) {
      const firstPage = await replies(alice, post.id, parent)
      expect(firstPage.items).toHaveLength(10)
      expect(firstPage.nextAfter).toBe(firstPage.items.at(-1)?.id)
      const secondPage = await replies(alice, post.id, parent, firstPage.nextAfter!)
      expect(secondPage.items).toHaveLength(2)
      expect(secondPage.nextAfter).toBeNull()
      expect(secondPage.items[0].id).toBeGreaterThan(firstPage.nextAfter!)
    }
    await ok(alice, { action: 'delete', id: child.id })
    await ok(bob, { action: 'delete', id: reply.id })
    expect(await db.prepare('SELECT COUNT(*) AS total FROM meetup15_reply_reactions').first('total')).toBe(1)
    await ok(alice, { action: 'delete', id: post.id })
    expect(await db.prepare('SELECT COUNT(*) AS total FROM meetup15_reply_reactions').first('total')).toBe(0)
    expect((await feed(alice)).items).toEqual([])

    const moderation = '/admin/posts'
    await ok(alice, { action: 'post', section: 'expert', body: '管理员删帖验收' })
    const target = (await feed(alice)).items[0]
    await ok(bob, { action: 'reply', postId: target.id, parentId: null, body: '关联回复' })
    const targetReply = (await replies(bob, target.id)).items[0]
    expect((await read('', moderation)).status).toBe(401)
    expect((await read(bob, moderation)).status).toBe(401)
    const page = await (await read(admin, moderation + '?section=expert')).json()
    expect(page).toMatchObject({ posts: [{ id: target.id, author: 'Alice', replyCount: 1 }] })
    expect((await command(bob, { action: 'delete-post', id: target.id }, moderation)).status).toBe(401)
    expect((await command(admin, { action: 'delete-post', id: target.id }, moderation, 'https://other.example')).status).toBe(403)
    expect((await command(admin, { action: 'delete-post', id: targetReply.id }, moderation)).status).toBe(409)
    await ok(admin, { action: 'delete-post', id: target.id }, moderation)
    expect((await feed(alice)).items).toEqual([])
    expect((await replies(bob, target.id)).items).toEqual([])
    expect((await command(admin, { action: 'delete-post', id: target.id }, moderation)).status).toBe(409)

    await ok(admin, { action: 'start', guestId: 'guest', activeRoundId: null, latestRoundId: null }, '/admin')
    const first = (await staff()).activeRound!
    expect(first.section).toBe('expert')
    await ok(admin, { action: 'section', section: null }, '/admin')
    expect((await feed(alice)).section).toBe('lightning')
    expect((await feed(alice)).viewedRound).toBeNull()
    expect((await command(alice, {
      action: 'question', section: 'lightning', roundId: first.id, body: '错误板块',
    })).status).toBe(409)
    const question = '问'.repeat(99) + '？'
    expect((await command(alice, { action: 'question', section: 'expert', roundId: first.id, body: question + '。' })).status).toBe(400)
    await ok(alice, { action: 'question', section: 'expert', roundId: first.id, body: question })
    await ok(bob, { action: 'question', section: 'expert', roundId: first.id, body: '后问的问题' })
    const [older, newer] = (await activeQa()).questions
    expect([older.body, newer.body]).toEqual([question, '后问的问题'])
    await ok(alice, { action: 'like', id: newer.id, liked: true })
    expect((await activeQa()).questions[0].id).toBe(newer.id)
    const [aliceQuestions, bobQuestions] = await Promise.all([
      feed(alice, '?section=expert'), feed(bob, '?section=expert'),
    ])
    expect(aliceQuestions.questions[0]).toMatchObject({ id: newer.id, likes: 1, liked: true, mine: false })
    expect(bobQuestions.questions[0]).toMatchObject({ id: newer.id, likes: 1, liked: false, mine: true })
    expect(aliceQuestions.questions[0]).not.toHaveProperty('likedBy')
    await db.prepare("UPDATE meetup15_members SET display_name = 'Bob 新昵称' WHERE id = 'bob'").run()
    expect((await feed(alice, '?section=expert')).questions[0].author).toBe('Bob 新昵称')
    await ok(alice, { action: 'like', id: newer.id, liked: false })
    expect((await feed(alice, '?section=expert')).questions.find(item => item.id === newer.id))
      .toMatchObject({ likes: 0, liked: false })
    await ok(alice, { action: 'like', id: newer.id, liked: true })

    const attendeeSocket = (await connect(alice)).webSocket!
    const screenSocket = (await connect(admin)).webSocket!
    attendeeSocket.accept()
    screenSocket.accept()
    const updates = Promise.all([attendeeSocket, screenSocket].map((socket) => new Promise((resolve) => {
      socket.addEventListener('message', (event) => resolve(event.data), { once: true })
    })))
    await ok(admin, { action: 'answer', id: newer.id, answered: true }, '/admin')
    await expect(updates).resolves.toEqual(['activity.updated', 'activity.updated'])
    const order = (snapshot: Pick<FeedSnapshot, 'questions'>) => snapshot.questions.map((q) => q.id)
    expect(order(await activeQa())).toEqual([older.id, newer.id])
    expect(order(await feed(alice, '?section=expert'))).toEqual([older.id, newer.id])
    await ok(admin, { action: 'answer', id: newer.id, answered: false }, '/admin')
    expect(order(await activeQa())).toEqual([newer.id, older.id])

    await ok(admin, { action: 'start', guestId: 'guest', activeRoundId: first.id, latestRoundId: first.id }, '/admin')
    expect((await command(admin, { action: 'start', guestId: 'guest', activeRoundId: first.id, latestRoundId: first.id }, '/admin')).status).toBe(409)
    const second = (await staff()).activeRound!
    expect(second).toMatchObject({ guest: first.guest, section: 'lightning' })
    expect(second.id).not.toBe(first.id)
    expect(await activeQa()).toMatchObject({ round: { id: second.id }, questions: [] })
    expect(await activeQa()).not.toHaveProperty('rounds')
    expect((await projection()).rounds.map((round) => round.id)).toEqual([second.id, first.id])
    expect(order(await feed(alice, '?section=expert&round=' + first.id))).toEqual([newer.id, older.id])
    await ok(admin, { action: 'end', roundId: second.id }, '/admin')
    expect((await screen()).mode).toBe('hidden')
    expect((await command(admin, { action: 'start', guestId: 'guest', activeRoundId: null, latestRoundId: null }, '/admin')).status).toBe(409)
    expect((await staff()).rounds).toHaveLength(2)

    const { revision } = await projection()
    const historical = await preview('mode=qa&roundId=' + first.id)
    expect(historical.status).toBe(200)
    expect(await historical.json()).toMatchObject({ mode: 'qa', round: { id: first.id } })
    expect((await screen()).mode).toBe('hidden')
    expect((await switchScreen({ mode: 'qa', roundId: 999, revision })).status).toBe(409)
    const screenChanged = new Promise((resolve) => {
      screenSocket.addEventListener('message', (event) => {
        if (event.data === 'screen.updated') resolve(event.data)
      })
    })
    expect((await switchScreen({ mode: 'qa', roundId: first.id, revision })).status).toBe(204)
    await expect(screenChanged).resolves.toBe('screen.updated')
    expect(order(await activeQa())).toEqual([newer.id, older.id])
    expect((await activeQa()).round.closedAt).not.toBeNull()
    expect((await feed(alice, '?section=expert')).activeRound).toBeNull()
    expect((await command(alice, { action: 'question', section: 'expert', roundId: first.id, body: '历史轮次' })).status).toBe(409)
    expect((await switchScreen({ mode: 'raffle', revision: (await projection()).revision })).status).toBe(204)
    expect(await screen()).toMatchObject({ mode: 'raffle', lottery: null })
    attendeeSocket.close(1000)
    screenSocket.close(1000)
  } finally {
    await runtime.dispose()
  }
}, 20_000)
