import { readFile, readdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import { ADMISSION_END, INTERACTION_END } from '../src/lib/meetup15/event'
import { MEMBER_COOKIE } from '../src/lib/meetup15/identity'
import type { PollAdminSnapshot, PollFeedSnapshot, ScreenSnapshot } from '../src/lib/meetup15/polls'
import { ACTIVITY_ADMIN_COOKIE, signSessionCookie } from '../src/lib/session-cookie-crypto'

it('enforces ballot and reveal rules across guest, attendee, control desk and projection', async () => {
  let now = Date.parse('2026-11-14T13:45:00+01:00')
  const origin = 'http://localhost'
  const secret = 'local-poll-fixture-signing-key-only'
  const signed = (name: string, value: string, expires: number) =>
    `${name}=${signSessionCookie(name, value, new Date(expires), secret)}`
  const admin = signed(ACTIVITY_ADMIN_COOKIE, '1', Date.now() + 60_000)
  const member = (id: string) => signed(MEMBER_COOKIE, id, ADMISSION_END + 60_000)
  const guest = member('guest')
  const alice = member('alice')
  const bob = member('bob')
  const bundle = await build({
    stdin: {
      contents: `
        import { handlePolls } from './cloudflare/meetup-polls'
        import { handleDiscussion } from './cloudflare/meetup-discussion'
        export { ActivityUpdates } from './cloudflare/activity'
        export default { fetch(request, env) {
          const handler = new URL(request.url).pathname.startsWith('/api/polls') ? handlePolls : handleDiscussion
          return handler(request, env, () => Number(request.headers.get('fixture-clock')))
        } }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], write: false,
  })
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'polls.mjs', contents: bundle.outputFiles[0].text }],
    compatibilityDate: '2026-04-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACTIVITY_DB: 'fixture-polls' },
    durableObjects: { ACTIVITY_UPDATES: { className: 'ActivityUpdates', useSQLite: true } },
    bindings: { SESSION_SECRET: secret },
  }))
  const request = (path: string, cookie: string, body?: object, from = origin) =>
    runtime.dispatchFetch(origin + path, {
      headers: { Cookie: cookie, Origin: from, 'Content-Type': 'application/json', 'fixture-clock': String(now) },
      method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    })
  const read = async <T>(path: string, cookie: string) => {
    const response = await request(path, cookie)
    expect(response.status).toBe(200)
    return await response.json() as T
  }
  const feed = (cookie: string, section = '') => read<PollFeedSnapshot>('/api/polls' + section, cookie)
  const screen = () => read<ScreenSnapshot>('/api/polls/screen', admin)
  const controls = () => read<PollAdminSnapshot>('/api/polls/admin', admin)
  const command = (cookie: string, body: object) => request('/api/polls', cookie, body)
  const control = (body: object) => request('/api/polls/admin', admin, body)
  const status = async (response: ReturnType<typeof request>, code = 204) => expect((await response).status).toBe(code)

  try {
    const db = await runtime.getD1Database('ACTIVITY_DB')
    for (const file of (await readdir('migrations')).sort()) {
      const sql = await readFile('migrations/' + file, 'utf8')
      const statements = sql.trim().split(/;\s*\n(?=(?:CREATE|ALTER|INSERT)\b)/)
      await db.batch(statements.map((statement) => db.prepare(statement)))
    }
    await db.batch([
      db.prepare("INSERT INTO meetup15_members (id, role) VALUES ('alice','attendee'), ('bob','attendee')"),
      db.prepare(`INSERT INTO meetup15_members (id, role, display_name, username, password_hash)
        VALUES ('guest','guest','测试嘉宾','guest','fixture'), ('other','guest','另一位嘉宾','other','fixture')`),
    ])

    const single = { action: 'create', title: '公开投票', section: 'lightning', options: ['甲', '乙'], hidden: false, multiple: false }
    await status(request('/api/polls', ''), 401)
    await status(request('/api/polls/screen', alice), 401)
    await status(request('/api/polls/admin', guest, { action: 'intro' }), 401)
    await status(request('/api/polls', guest, single, 'https://elsewhere.example'), 403)
    await status(command(alice, single), 403)
    await status(command(guest, { ...single, options: ['甲'] }), 400)
    await status(command(guest, { ...single, options: Array.from({ length: 7 }, (_, index) => String(index)) }), 400)
    await status(command(guest, single))
    const publicPoll = (await feed(bob)).polls[0]
    expect(publicPoll).toMatchObject({ counts: [0, 0], deadline: ADMISSION_END / 1000, closed: false })
    await status(command(guest, { action: 'vote', id: publicPoll.id, choices: [0] }), 403)
    await status(command(alice, { action: 'vote', id: publicPoll.id, choices: [0, 1] }), 409)
    await status(command(alice, { action: 'vote', id: publicPoll.id, choices: [2] }), 409)
    await status(command(alice, { action: 'vote', id: publicPoll.id, choices: [0] }))
    expect((await feed(bob)).polls[0].counts).toEqual([1, 0])
    await status(command(alice, { action: 'vote', id: publicPoll.id, choices: [1] }))
    expect((await feed(bob)).polls[0]).toMatchObject({ counts: [0, 1], voters: 1 })
    await status(request('/api/discussion', alice), 200)
    expect(await screen()).toMatchObject({ mode: 'live', online: 1, agenda: '创业者 Lightning Talk' })

    const multi = { ...single, title: '提前截止的隐藏投票', hidden: true, multiple: true, options: ['甲', '乙', '丙', '丁', '戊', '己'] }
    await status(command(guest, multi))
    const early = (await feed(bob)).polls[0].id
    await status(control({ action: 'reveal', id: early }), 409)
    const subscription = await runtime.dispatchFetch(origin + '/api/discussion/updates', {
      headers: { Cookie: bob, Origin: origin, Upgrade: 'websocket', 'fixture-clock': String(now) },
    })
    const socket = subscription.webSocket!
    socket.accept()
    const events: string[] = []
    const received = new Promise<void>((resolve) => {
      socket.addEventListener('message', (event) => {
        events.push(String(event.data))
        if (event.data === 'screen.updated') resolve()
      })
    })
    await status(command(alice, { action: 'vote', id: early, choices: [5, 1] }))
    await status(command(alice, { action: 'vote', id: early, choices: [1, 5] }))
    // 旧选票按勾选顺序存储，相同选项仍应跳过写入和通知。
    await db.prepare("UPDATE meetup15_ballots SET choices = '[5,1]' WHERE poll_id = ? AND member_id = 'alice'").bind(early).run()
    await status(command(alice, { action: 'vote', id: early, choices: [1, 5] }))
    expect(await db.prepare("SELECT choices FROM meetup15_ballots WHERE poll_id = ? AND member_id = 'alice'")
      .bind(early).first('choices')).toBe('[5,1]')
    await status(control({ action: 'live' }))
    await received
    expect(events).toEqual(['poll.updated:lightning', 'screen.updated'])
    socket.close(1000)
    await status(command(alice, { action: 'vote', id: early, choices: [1] }))
    await status(command(alice, { action: 'vote', id: early, choices: [1, 5] }))
    expect((await feed(alice)).polls[0]).toMatchObject({ counts: [0, 1, 0, 0, 0, 1], ballot: [1, 5] })
    expect((await feed(bob)).polls[0].counts).toBeNull()
    expect(await screen()).toMatchObject({ mode: 'live', polls: [{ id: early, counts: null }, { id: publicPoll.id, counts: [0, 1] }] })
    await status(command(member('other'), { action: 'close', id: early }), 409)
    await status(command(guest, { action: 'close', id: early }))
    await status(command(alice, { action: 'vote', id: early, choices: [0] }), 409)
    expect((await feed(bob)).polls[0].counts).toEqual([0, 1, 0, 0, 0, 1])
    expect(await screen()).toMatchObject({ mode: 'live', polls: [{ id: publicPoll.id }] })
    expect((await controls()).revealable.map(({ id }) => id)).toEqual([early])
    await status(control({ action: 'reveal', id: early }))
    await status(control({ action: 'intro' }), 409)
    await status(control({ action: 'filter', section: 'panel' }))
    await status(request('/api/discussion/admin', admin, { action: 'start', guestId: 'guest', activeRoundId: null, latestRoundId: null }))
    expect(await screen()).toMatchObject({ mode: 'reveal', poll: { id: early, counts: [0, 1, 0, 0, 0, 1] } })
    expect((await feed(bob)).polls).toHaveLength(2)
    await status(control({ action: 'live' }))
    expect(await screen()).toMatchObject({ mode: 'qa', round: { guest: '测试嘉宾' } })
    await db.prepare("UPDATE activity_state SET screen_lottery = '{\"phase\":\"drawing\"}'").run()
    expect(await screen()).toMatchObject({ mode: 'lottery', lottery: { phase: 'drawing' } })
    await status(control({ action: 'intro' }))
    expect(await screen()).toMatchObject({ mode: 'intro' })
    await db.prepare("UPDATE activity_state SET screen_lottery = NULL").run()
    await status(request('/api/discussion/admin', admin, { action: 'end', roundId: 1 }))
    await status(request('/api/discussion/admin', admin, { action: 'start', guestId: 'guest', activeRoundId: null, latestRoundId: 1 }))
    expect(await screen()).toMatchObject({ mode: 'qa' })
    await status(request('/api/discussion/admin', admin, { action: 'end', roundId: 2 }))
    await status(control({ action: 'live' }))
    expect(await screen()).toMatchObject({ mode: 'live', polls: [] })
    expect((await feed(bob)).polls).toHaveLength(2)

    await status(command(guest, { ...multi, section: 'panel', title: '自然截止的隐藏投票' }))
    const natural = (await feed(bob, '?section=panel')).polls[0].id
    now = ADMISSION_END - 1
    await status(command(alice, { action: 'vote', id: natural, choices: [2] }))
    expect(await screen()).toMatchObject({ mode: 'live', polls: [{ id: natural, counts: null }], refreshAt: ADMISSION_END })
    now = ADMISSION_END
    await status(command(guest, single), 409)
    await status(command(alice, { action: 'vote', id: natural, choices: [1] }), 409)
    expect((await feed(bob, '?section=panel')).polls[0]).toMatchObject({ closed: true, counts: [0, 0, 1, 0, 0, 0] })
    expect(await screen()).toMatchObject({ mode: 'live', polls: [] })
    expect((await controls()).revealable.map(({ id }) => id)).toEqual([natural, early])
    await status(control({ action: 'reveal', id: natural }))
    expect(await screen()).toMatchObject({ mode: 'reveal', poll: { id: natural, counts: [0, 0, 1, 0, 0, 0] } })
    await status(control({ action: 'reveal', id: early }), 409)
    now = INTERACTION_END
    await status(control({ action: 'live' }))
    expect(await screen()).toMatchObject({ mode: 'live' })
  } finally {
    await runtime.dispose()
  }
}, 20_000)
