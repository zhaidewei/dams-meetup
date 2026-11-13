import { readFile, readdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import { ADMISSION_END, INTERACTION_END } from '../src/lib/meetup15/event'
import { admissionCredentials, MEMBER_COOKIE, recoveryPath } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, signSessionCookie, verifySessionCookie } from '../src/lib/session-cookie-crypto'

it('enforces both Amsterdam cutoffs and only clears D1 after the published revision is confirmed', async () => {
  const origin = 'http://localhost'
  const secret = 'fixture-closeout-only-signing-key-32'
  const id = '00000000-0000-4000-8000-000000000001'
  const signed = (name: string, value: string, expires: number) =>
    `${name}=${signSessionCookie(name, value, new Date(expires), secret)}`
  const member = signed(MEMBER_COOKIE, id, INTERACTION_END)
  const admin = signed(ACTIVITY_ADMIN_COOKIE, '1', Date.now() + 60_000)
  const bundle = await build({
    stdin: {
      contents: `
        import { handleMeetupAccess } from './cloudflare/meetup-access'
        import { handleDiscussion } from './cloudflare/meetup-discussion'
        import { handlePersonal } from './cloudflare/meetup-personal'
        import { handleMeetupSummary } from './cloudflare/meetup-summary'
        export { ActivityUpdates } from './cloudflare/activity'
        export default { fetch(request, env) {
          const path = new URL(request.url).pathname
          const now = Number(request.headers.get('X-Test-Time'))
          if (path.startsWith('/api/meetup/')) return handleMeetupAccess(request, env, () => now)
          if (path === '/api/discussion') return handleDiscussion(request, env, () => now)
          if (path === '/api/personal') return handlePersonal(request, env, () => now)
          return handleMeetupSummary(request, env, now)
        } }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], write: false,
  })
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'closeout.mjs', contents: bundle.outputFiles[0].text }],
    compatibilityDate: '2026-04-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACTIVITY_DB: 'fixture-closeout' },
    durableObjects: { ACTIVITY_UPDATES: { className: 'ActivityUpdates', useSQLite: true } },
    bindings: { SESSION_SECRET: secret },
    ratelimits: {
      ACTIVITY_LOGIN_LIMIT: { namespace_id: '1011', simple: { limit: 15, period: 60 } },
      ACTIVITY_ENTRY_LIMIT: { namespace_id: '1012', simple: { limit: 600, period: 60 } },
    },
  }))
  async function request(path: string, now: number, cookie = '', body?: FormData | URLSearchParams | string, from = origin) {
    const multipart = body instanceof FormData ? new Request(origin, { method: 'POST', body }) : null
    const contentType = multipart?.headers.get('Content-Type') ?? (typeof body === 'string' ? 'application/json' : '')
    return runtime.dispatchFetch(origin + '/api/' + path, {
      method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { Cookie: cookie, Origin: from, 'X-Test-Time': String(now),
        ...(contentType ? { 'Content-Type': contentType } : {}) },
      body: body instanceof FormData ? await multipart!.arrayBuffer() : body,
    })
  }
  const publish = (metrics: object) => {
    const form = new FormData()
    form.set('action', 'publish')
    form.set('summary', new Blob([JSON.stringify(metrics)], { type: 'application/json' }), 'summary.json')
    return form
  }
  const cleanup = (revision: number, confirmed = true) =>
    new URLSearchParams({ action: 'cleanup', revision: String(revision), archived: confirmed ? 'yes' : '' })
  const status = (response: Awaited<ReturnType<typeof request>>) =>
    new URL(response.headers.get('Location')!, origin).searchParams.get('summary')

  try {
    const db = await runtime.getD1Database('ACTIVITY_DB')
    for (const file of (await readdir('migrations')).sort()) {
      const sql = await readFile('migrations/' + file, 'utf8')
      const statements = sql.trim().split(/;\s*\n(?=(?:CREATE|ALTER|INSERT|UPDATE|DROP)\b)/)
      await db.batch(statements.map(statement => db.prepare(statement)))
    }
    await db.batch([
      db.prepare("INSERT INTO meetup15_members (id, role, display_name) VALUES (?, 'attendee', '样例观众')").bind(id),
      db.prepare("INSERT INTO meetup15_members (id, role, display_name, username, password_hash) VALUES ('guest', 'guest', '样例嘉宾', 'test-guest', 'fixture')"),
      db.prepare("INSERT INTO meetup15_qa_rounds (title, section) VALUES ('测试问答', 'lounge')"),
      db.prepare("INSERT INTO meetup15_raffles (candidates, ready_at, finished_at, winner_id, winner_name) VALUES ('[]', 1, 2, ?, '样例观众')").bind(id),
      db.prepare('INSERT INTO meetup15_dm_threads (member_a) VALUES (?)').bind(id),
      db.prepare("INSERT INTO meetup15_dm_messages (thread_id, raffle_id, body) VALUES (1, 1, '中奖私信')"),
      db.prepare("UPDATE activity_state SET admission_open=1, projection_mode='raffle', projection_raffle_id=1, section_override='expert' WHERE id=1"),
    ])

    const credentials = admissionCredentials(secret)
    const recovery = new URLSearchParams(new URL(recoveryPath(id, secret), origin).hash.slice(1))
    const recover = new URLSearchParams({ id: recovery.get('u')!, token: recovery.get('t')! })
    for (const method of ['password', 'qr'] as const) {
      const entry = new URLSearchParams({ method, credential: credentials[method] })
      const stopped = await request('meetup/enter', ADMISSION_END, '', entry)
      expect(stopped.headers.get('Location')).toBe('/?entry=closed')
      expect(stopped.headers.has('Set-Cookie')).toBe(false)
    }
    const restored = await request('meetup/recover', ADMISSION_END, '', recover)
    expect(restored.headers.get('Location')).toBe('/feed')
    const restoredToken = restored.headers.get('Set-Cookie')!.split(';')[0].slice(MEMBER_COOKIE.length + 1)
    expect(verifySessionCookie(MEMBER_COOKIE, restoredToken, secret, ADMISSION_END)).toBe(id)
    expect((await request('discussion', INTERACTION_END - 1, member, JSON.stringify({
      action: 'post', section: 'lounge', body: '不公开的测试正文',
    }))).status).toBe(204)
    expect((await request('personal', INTERACTION_END - 1, member)).status).toBe(200)
    expect((await request('discussion', INTERACTION_END, member)).status).toBe(401)
    expect((await request('personal', INTERACTION_END, member)).status).toBe(401)
    expect((await request('meetup/recover', INTERACTION_END, '', recover)).headers.get('Location')).toBe('/?entry=ended')

    const route = 'admin/meetup-summary'
    expect((await request(route, INTERACTION_END, '', publish({ attendees: 12 }))).status).toBe(401)
    expect((await request(route, INTERACTION_END, admin, cleanup(1), 'https://elsewhere.invalid')).status).toBe(403)
    expect(status(await request(route, ADMISSION_END - 1, admin, publish({ attendees: 12 })))).toBe('early')
    expect(status(await request(route, INTERACTION_END, admin, cleanup(1)))).toBe('changed')
    expect(status(await request(route, INTERACTION_END, admin, publish({ attendees: 12, body: '原文' })))).toBe('invalid')
    expect(status(await request(route, ADMISSION_END, admin, publish({ attendees: 12, posts: 0 })))).toBe('published')
    expect(status(await request(route, INTERACTION_END - 1, admin, cleanup(1)))).toBe('early')
    expect(status(await request(route, INTERACTION_END, admin, cleanup(1, false)))).toBe('confirm')
    expect(status(await request(route, INTERACTION_END, admin, publish({ attendees: 13, posts: 1 })))).toBe('published')
    expect(status(await request(route, INTERACTION_END, admin, cleanup(1)))).toBe('changed')
    expect(await db.prepare('SELECT COUNT(*) AS count FROM meetup15_dm_messages').first('count')).toBe(1)

    const cleaned = await Promise.all([request(route, INTERACTION_END, admin, cleanup(2)), request(route, INTERACTION_END, admin, cleanup(2))])
    expect(cleaned.map(status)).toEqual(['cleaned', 'cleaned'])
    const lateGuest = await request('meetup/guests', INTERACTION_END - 1, admin, new URLSearchParams({
      username: 'late-guest', password: 'local-fixture-password', displayName: '晚到的测试嘉宾',
    }))
    expect(lateGuest.headers.get('Location')).toBe('/?entry=ended')
    const state = await db.prepare('SELECT * FROM activity_state').all()
    expect(state.results).toEqual([expect.objectContaining({
      id: 1, admission_open: 0, projection_mode: 'agenda', projection_raffle_id: null,
      projection_round_id: null, section_override: null, revision: 1, projection_revision: 3,
    })])
    for (const table of ['members', 'dm_threads', 'dm_messages', 'discussion', 'qa_rounds', 'raffles']) {
      expect(await db.prepare(`SELECT COUNT(*) AS count FROM meetup15_${table}`).first('count')).toBe(0)
    }
    const summary = await db.prepare('SELECT metrics, cleaned_at FROM meetup15_summary WHERE id=1')
      .first<{ metrics: string; cleaned_at: number }>()
    expect(summary?.cleaned_at).toBe(INTERACTION_END)
    expect(JSON.parse(summary!.metrics)).toEqual({ attendees: 13, posts: 1 })

    await db.batch([
      db.prepare('DELETE FROM activity_state'),
      db.prepare('UPDATE meetup15_summary SET cleaned_at = NULL WHERE id = 1'),
    ])
    expect(status(await request(route, INTERACTION_END, admin, cleanup(2)))).toBe('cleaned')
    expect(await db.prepare('SELECT id, admission_open, projection_mode FROM activity_state').all())
      .toMatchObject({ results: [{ id: 1, admission_open: 0, projection_mode: 'agenda' }] })
  } finally {
    await runtime.dispose()
  }
}, 20_000)
