import { readFile, readdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import type { PersonalSnapshot, ThreadSnapshot } from '../src/lib/meetup15/personal'
import { MEMBER_COOKIE } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, signSessionCookie } from '../src/lib/session-cookie-crypto'

it('keeps contact and message views private and commits one prize and message across concurrent projections', async () => {
  const now = Date.parse('2026-11-14T13:45:00+01:00')
  const origin = 'http://localhost'
  const secret = 'local-personal-fixture-signing-key'
  const signed = (name: string, value: string, expires: number) =>
    `${name}=${signSessionCookie(name, value, new Date(expires), secret)}`
  const admin = signed(ACTIVITY_ADMIN_COOKIE, '1', Date.now() + 60_000)
  const member = (id: string) => signed(MEMBER_COOKIE, id, now + 60_000)
  const alice = member('alice')
  const bob = member('bob')
  const charlie = member('charlie')
  const bundle = await build({
    stdin: {
      contents: `
        import { handlePersonal } from './cloudflare/meetup-personal'
        import { handleRaffle } from './cloudflare/meetup-raffle'
        import { handleProjection } from './cloudflare/meetup-projection'
        export { ActivityUpdates } from './cloudflare/activity'
        export default { fetch(request, env) {
          const path = new URL(request.url).pathname
          if (path.startsWith('/api/personal')) return handlePersonal(request, env, () => ${now})
          if (path === '/api/raffle') return handleRaffle(request, env, () => ${now})
          return handleProjection(request, env)
        } }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], write: false,
  })
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'personal.mjs', contents: bundle.outputFiles[0].text }],
    compatibilityDate: '2026-04-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACTIVITY_DB: 'fixture-personal' },
    durableObjects: { ACTIVITY_UPDATES: { className: 'ActivityUpdates', useSQLite: true } },
    bindings: { SESSION_SECRET: secret },
  }))
  const request = (path: string, cookie: string, body?: object, from = origin) =>
    runtime.dispatchFetch(origin + '/api/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { Cookie: cookie, Origin: from, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    })
  const overview = async (cookie: string) => await (await request('personal', cookie)).json() as PersonalSnapshot
  const thread = async (cookie: string, id: number) =>
    await (await request(`personal?thread=${id}`, cookie)).json() as ThreadSnapshot

  try {
    const db = await runtime.getD1Database('ACTIVITY_DB')
    for (const file of (await readdir('migrations')).sort()) {
      const sql = await readFile('migrations/' + file, 'utf8')
      const statements = sql.trim().split(/;\s*\n(?=(?:CREATE|ALTER|INSERT|UPDATE)\b)/)
      await db.batch(statements.map((statement) => db.prepare(statement)))
    }
    const seconds = now / 1000
    await db.batch([
      db.prepare(`INSERT INTO meetup15_members (id, role, display_name, last_seen_at) VALUES
        ('alice', 'attendee', 'Alice', ?), ('bob', 'attendee', NULL, ?),
        ('charlie', 'attendee', 'Charlie', ?), ('inactive', 'attendee', 'Inactive', ?)`)
        .bind(seconds, seconds, seconds, seconds - 4 * 60 * 60 - 1),
      db.prepare(`INSERT INTO meetup15_members (id, role, display_name, username, password_hash, last_seen_at)
        VALUES ('guest', 'guest', 'Guest', 'guest', 'fixture', ?)`).bind(seconds),
      db.prepare(`INSERT INTO meetup15_discussion (kind, author_id, section, body)
        VALUES ('post', 'alice', 'lounge', '普通文字帖'), ('post', 'inactive', 'lounge', '旧帖子'),
               ('post', 'guest', 'lounge', '嘉宾帖子')`),
      db.prepare(`INSERT INTO meetup15_discussion (kind, author_id, section, body, post_id)
        VALUES ('reply', 'bob', 'lounge', '回复文字帖', 1)`),
    ])

    expect((await request('personal', '')).status).toBe(401)
    await overview(member('inactive'))
    expect(await db.prepare("SELECT last_seen_at FROM meetup15_members WHERE id='inactive'").first('last_seen_at'))
      .toBe(seconds - 4 * 60 * 60 - 1)
    const profile = { action: 'profile', name: 'Alice', contact: 'private@example.test', contactPublic: false, revision: 0 }
    expect((await request('personal', alice, profile, 'https://other.example')).status).toBe(403)
    expect((await request('personal', alice, profile)).status).toBe(204)
    expect((await overview(alice)).contact).toBe(profile.contact)
    expect(await (await request('personal?member=alice', bob)).json()).toMatchObject({ contact: null })
    const publicProfile = { ...profile, contactPublic: true, revision: 1 }
    expect((await request('personal', alice, publicProfile)).status).toBe(204)
    expect(await (await request('personal?member=alice', bob)).json()).toMatchObject({ contact: profile.contact })
    expect((await request('personal', alice, { ...profile, revision: 2 })).status).toBe(204)
    expect((await request('personal', alice, { ...publicProfile, name: 'Stale' })).status).toBe(409)
    expect(await (await request('personal?member=alice', bob)).json()).toMatchObject({ contact: null })

    const publicFields = { company: 'DAMS', wechat: 'example-wechat',
      linkedin: 'https://www.linkedin.com/in/example', phone: '+31 600000000', email: 'public@example.test' }
    const structured = { action: 'profile', name: 'Alice', publicProfile: publicFields, removeLegacyContact: false, revision: 3 }
    expect((await request('personal', alice, { ...structured,
      publicProfile: { linkedin: 'https://linkedin.com.example.test/in/alice' } })).status).toBe(400)
    expect((await request('personal', alice, structured)).status).toBe(204)
    expect((await overview(alice)).contact).toBe(profile.contact)
    expect(await (await request('personal?member=alice', bob)).json()).toMatchObject({
      contact: null, publicProfile: publicFields,
    })
    expect((await request('personal?member=alice', '')).status).toBe(401)
    expect((await request('personal', alice, { ...structured, publicProfile: { email: ' ' },
      removeLegacyContact: true, revision: 4 })).status).toBe(204)
    expect((await overview(alice)).contact).toBeNull()
    expect(await (await request('personal?member=alice', bob)).json()).toHaveProperty('publicProfile', {})

    const inbox = await overview(alice)
    expect(inbox.posts[0].body).toBe('普通文字帖')
    expect(inbox.replies[0]).toMatchObject({ body: '回复文字帖', unread: 1 })
    expect((await request('personal', alice, { action: 'replies-read', through: inbox.replies[0].id })).status).toBe(204)
    expect((await overview(alice)).replies[0].unread).toBe(0)

    expect((await request('personal?member=alice', bob, { action: 'send', body: '无昵称' })).status).toBe(409)
    expect((await request('personal', bob, { action: 'profile', name: 'Bob', contact: '', contactPublic: false, revision: 0 })).status).toBe(204)
    expect((await request('personal?member=bob', alice, { action: 'send', body: '第一条' })).status).toBe(204)
    expect((await request('personal?member=alice', bob, { action: 'send', body: '第二条' })).status).toBe(204)
    const [a, b] = await Promise.all([overview(alice), overview(bob)])
    const first = a.threads[0]
    expect(b.threads[0].id).toBe(first.id)
    expect(first.contactId).toBe('bob')
    expect(b.threads[0].contactId).toBe('alice')
    expect(first.unread).toBe(1)
    expect((await request(`personal?thread=${first.id}`, charlie)).status).toBe(404)
    expect((await thread(alice, first.id)).messages.map(message => message.body)).toEqual(['第一条', '第二条'])
    expect((await request(`personal?thread=${first.id}`, alice, { action: 'thread-read', through: first.latestId })).status).toBe(204)
    expect((await overview(alice)).threads[0].unread).toBe(0)
    expect((await request(`personal?thread=${first.id}`, bob, { action: 'send', body: '删除后的新消息' })).status).toBe(204)
    expect((await request(`personal?thread=${first.id}`, alice, { action: 'thread-delete', through: first.latestId })).status).toBe(204)
    expect((await thread(bob, first.id)).messages).toHaveLength(3)
    expect((await overview(alice)).threads[0].unread).toBe(1)
    expect((await thread(alice, first.id)).messages.map(message => message.body)).toEqual(['删除后的新消息'])
    const lastId = (await overview(alice)).threads[0].latestId
    expect((await request(`personal?thread=${first.id}`, alice, { action: 'thread-delete', through: lastId })).status).toBe(204)
    expect((await overview(alice)).threads).toEqual([])
    expect((await request('personal', charlie, { action: 'profile', name: 'Bob', contact: '', contactPublic: false, revision: 0 })).status).toBe(204)
    expect((await request('personal?member=alice', bob, { action: 'send', body: 'Bob 的消息' })).status).toBe(204)
    expect((await request('personal?member=alice', charlie, { action: 'send', body: '另一位 Bob 的消息' })).status).toBe(204)
    expect((await overview(alice)).threads.map(({ contactId, name }) => ({ contactId, name }))).toEqual([
      { contactId: 'charlie', name: 'Bob' },
      { contactId: 'bob', name: 'Bob' },
    ])

    expect((await request('screen/admin', admin, { mode: 'raffle', revision: 0 })).status).toBe(204)
    const start = { action: 'start', weighted: true, requireParticipation: true, latestId: 0 }
    const attempts = await Promise.all([request('raffle', admin, start), request('raffle', admin, start)])
    expect(attempts.map(response => response.status).sort()).toEqual([204, 409])
    const draw = await db.prepare('SELECT id, candidates, winner_id FROM meetup15_raffles').first<{
      id: number; candidates: string; winner_id: string | null
    }>()
    expect(JSON.parse(draw!.candidates)).toEqual(expect.arrayContaining([
      { id: 'alice', name: 'Alice', weight: 3 }, { id: 'bob', name: 'Bob', weight: 1 },
    ]))
    expect(JSON.parse(draw!.candidates)).toHaveLength(2)
    expect(draw?.winner_id).toBeNull()
    expect(await (await request('screen', admin)).json()).toMatchObject({
      mode: 'raffle', lottery: { phase: 'drawing', candidateCount: 2 },
      rules: { weighted: true, requireParticipation: true },
    })
    await db.prepare("UPDATE meetup15_members SET display_name = '已改名', last_seen_at = 0 WHERE id IN ('alice','bob')").run()
    await db.prepare('UPDATE meetup15_raffles SET ready_at = ? WHERE id = ?').bind(Date.now() - 10, draw!.id).run()
    await Promise.all([request('raffle', admin, { action: 'finish' }), request('raffle', admin, { action: 'finish' })])
    const winner = await db.prepare('SELECT winner_id AS id, winner_name AS name FROM meetup15_raffles').first<{ id: string; name: string }>()
    expect(['alice', 'bob']).toContain(winner?.id)
    expect(['Alice', 'Bob']).toContain(winner?.name)
    expect(await (await request('screen', admin)).json()).toMatchObject({
      mode: 'raffle', lottery: { phase: 'winner', winner: winner?.name },
    })
    expect(await db.prepare('SELECT COUNT(*) FROM meetup15_dm_messages WHERE raffle_id IS NOT NULL').first<number>('COUNT(*)')).toBe(1)
    const notice = (await overview(member(winner!.id))).threads.find(item => item.system)
    expect(notice).toMatchObject({ contactId: null, name: '主办方通知', unread: 1, body: expect.stringContaining('中奖') })
    expect((await request(`personal?thread=${notice!.id}`, charlie)).status).toBe(404)
    await db.prepare("UPDATE meetup15_members SET last_seen_at = ? WHERE id IN ('alice','bob','charlie')").bind(seconds).run()
    expect((await request('raffle', admin, { ...start, latestId: draw!.id, weighted: false, requireParticipation: false })).status).toBe(204)
    const second = await db.prepare('SELECT id, candidates FROM meetup15_raffles ORDER BY id DESC LIMIT 1')
      .first<{ id: number; candidates: string }>()
    const pool = JSON.parse(second!.candidates) as { id: string; weight: number }[]
    expect(pool.map(candidate => candidate.id).sort()).toEqual([winner?.id === 'alice' ? 'bob' : 'alice', 'charlie'])
    expect(pool.every(candidate => candidate.weight === 1)).toBe(true)
    expect((await request(`screen/preview?mode=raffle&raffleId=${second!.id}`, admin)).status).toBe(404)
    expect((await request('screen/admin', admin, { mode: 'raffle', raffleId: second!.id, revision: 1 })).status).toBe(409)
    const history = await request(`screen/preview?mode=raffle&raffleId=${draw!.id}`, admin)
    expect(await history.json()).toMatchObject({
      raffleId: draw!.id,
      lottery: { phase: 'winner', winner: winner?.name },
      rules: { weighted: true, requireParticipation: true },
      candidates: expect.arrayContaining([
        { name: 'Alice', weight: 3, won: winner?.id === 'alice' },
        { name: 'Bob', weight: 1, won: winner?.id === 'bob' },
      ]),
    })
    expect(await (await request('screen', admin)).json()).toMatchObject({
      raffleId: second!.id, rules: { weighted: false, requireParticipation: false },
    })
    expect((await request('screen/admin', admin, { mode: 'raffle', raffleId: draw!.id, revision: 1 })).status).toBe(204)
    await db.prepare('UPDATE meetup15_raffles SET ready_at = ? WHERE id = ?').bind(Date.now() - 10, second!.id).run()
    expect((await request('raffle', admin, { action: 'finish' })).status).toBe(204)
    expect(await (await request('screen', admin)).json()).toMatchObject({ raffleId: draw!.id })
    expect(await (await request('screen/admin', admin)).json()).toMatchObject({
      raffleRounds: [{ id: second!.id }, { id: draw!.id }],
    })
    expect((await request('raffle', admin, { ...start, latestId: second!.id })).status).toBe(409)
    expect((await request('screen/admin', admin, { mode: 'raffle', revision: 2 })).status).toBe(204)
    expect(await (await request('screen', admin)).json()).toMatchObject({ raffleId: second!.id })
    await db.prepare("UPDATE meetup15_members SET last_seen_at = 0").run()
    expect((await request('raffle', admin, { ...start, latestId: second!.id, weighted: false })).status).toBe(204)
    expect(await (await request('screen', admin)).json()).toMatchObject({
      lottery: { phase: 'empty' }, rules: { weighted: false, requireParticipation: true },
    })
    const legacy = await db.prepare("INSERT INTO meetup15_raffles (candidates, ready_at, finished_at) VALUES ('[]', ?, ?) RETURNING id")
      .bind(now, now).first<number>('id')
    expect(await (await request(`screen/preview?mode=raffle&raffleId=${legacy}`, admin)).json())
      .toMatchObject({ lottery: { phase: 'empty' }, rules: null })
  } finally {
    await runtime.dispose()
  }
}, 20_000)
