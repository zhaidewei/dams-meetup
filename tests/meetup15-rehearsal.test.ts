import { readFile, readdir } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import { MEMBER_COOKIE } from '../src/lib/meetup15/identity'
import { MEETUP_SECTIONS, REHEARSAL_END } from '../src/lib/meetup15/event'
import { ACTIVITY_ADMIN_COOKIE, signSessionCookie } from '../src/lib/session-cookie-crypto'

it('clears rehearsal data atomically, preserves guests and the recap, and only fills an empty rehearsal once', async () => {
  const origin = 'http://localhost'
  const secret = 'local-rehearsal-test-signing-key'
  const admin = `${ACTIVITY_ADMIN_COOKIE}=${signSessionCookie(ACTIVITY_ADMIN_COOKIE, '1', new Date(Date.now() + 60_000), secret)}`
  const bundle = await build({
    stdin: {
      contents: `
        import { handleDiscussion } from './cloudflare/meetup-discussion'
        import { handleMeetupRehearsal } from './cloudflare/meetup-rehearsal'
        export { ActivityUpdates } from './cloudflare/activity'
        export default { fetch(request, env) {
          const url = new URL(request.url)
          if (url.pathname === '/api/discussion/updates') return handleDiscussion(request, env, () => ${REHEARSAL_END} - 1)
          const closed = url.searchParams.has('closed')
          return handleMeetupRehearsal(request, env, () => ${REHEARSAL_END} - Number(!closed))
        } }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], write: false,
  })
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'rehearsal.mjs', contents: bundle.outputFiles[0].text }],
    compatibilityDate: '2026-04-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACTIVITY_DB: 'fixture-rehearsal' },
    durableObjects: { ACTIVITY_UPDATES: { className: 'ActivityUpdates', useSQLite: true } },
    bindings: { SESSION_SECRET: secret },
  }))
  const request = (action: string, revision: number, cookie = admin, from = origin, closed = false) =>
    runtime.dispatchFetch(origin + '/api/admin/meetup-rehearsal' + (closed ? '?closed' : ''), {
      method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: from },
      body: new URLSearchParams({ action, revision: String(revision) }),
    })
  const status = (response: Awaited<ReturnType<typeof request>>) => new URL(response.headers.get('Location') ?? '/', origin).searchParams.get('rehearsal')

  try {
    const db = await runtime.getD1Database('ACTIVITY_DB')
    for (const file of (await readdir('migrations')).sort()) {
      const sql = await readFile('migrations/' + file, 'utf8')
      await db.batch(sql.trim().split(/;\s*\n(?=(?:CREATE|ALTER|INSERT|UPDATE|DROP)\b)/)
        .map(statement => db.prepare(statement)))
    }

    const state = () => db.prepare(`
      SELECT admission_open, revision, section_override, projection_mode, projection_round_id
      FROM activity_state WHERE id = 1
    `).first()
    const guests = () => db.prepare("SELECT * FROM meetup15_members WHERE role = 'guest'").all()
    const counts = () => db.prepare(`
      SELECT (SELECT COUNT(*) FROM meetup15_members WHERE role = 'attendee') AS attendees,
        (SELECT COUNT(*) FROM meetup15_discussion WHERE kind = 'post') AS posts,
        (SELECT COUNT(*) FROM meetup15_discussion WHERE kind = 'reply') AS replies,
        (SELECT COUNT(*) FROM meetup15_discussion WHERE kind = 'question') AS questions,
        (SELECT COUNT(*) FROM meetup15_discussion WHERE answered = 1) AS answered,
        (SELECT COUNT(*) FROM meetup15_discussion_likes) AS likes,
        (SELECT COUNT(*) FROM meetup15_qa_rounds WHERE closed_at IS NULL) AS open_rounds,
        (SELECT COUNT(*) FROM meetup15_raffles) AS raffles,
        (SELECT COUNT(*) FROM meetup15_dm_messages) AS messages
    `).first()
    expect(status(await request('fill', 0))).toBe('blocked')
    await db.batch([
      db.prepare("INSERT INTO meetup15_members (id, role, display_name, title, username, password_hash) VALUES ('guest', 'guest', 'Guest', 'Title', 'guest', 'fixture')"),
      db.prepare("INSERT INTO meetup15_members (id, role) VALUES ('old-attendee', 'attendee')"),
      db.prepare("INSERT INTO meetup15_discussion (kind, author_id, section, body) VALUES ('post', 'guest', 'expert', 'Rehearsal guest post')"),
      db.prepare("INSERT INTO meetup15_summary (id, metrics, published_at) VALUES (1, '{\"posts\":123}', 1)"),
      db.prepare("UPDATE activity_state SET section_override = 'expert', projection_mode = 'agenda'"),
    ])
    const guestBefore = await guests()
    expect((await request('clear', 0, '')).status).toBe(401)
    expect((await request('clear', 0, admin, 'https://other.example')).status).toBe(403)
    expect(status(await request('clear', 0, admin, origin, true))).toBe('closed')
    expect(status(await request('fill', 0))).toBe('blocked')
    expect(await counts()).toMatchObject({ attendees: 1, posts: 1 })

    const attendee = signSessionCookie(MEMBER_COOKIE, 'old-attendee', new Date(REHEARSAL_END), secret)
    const connect = () => runtime.dispatchFetch(origin + '/api/discussion/updates?qa=member', {
      headers: { Cookie: `${MEMBER_COOKIE}=${attendee}`, Origin: origin, Upgrade: 'websocket' },
    })
    const socket = (await connect()).webSocket!
    socket.accept()
    const reset = new Promise<unknown>(resolve => socket.addEventListener('message', event => resolve(event.data), { once: true }))
    expect(status(await request('clear', 0))).toBe('cleared')
    expect(await reset).toBe('activity.updated')
    expect((await connect()).status).toBe(401)
    socket.close()
    expect(await state()).toMatchObject({ admission_open: 0, revision: 1, section_override: null, projection_mode: 'hidden' })
    expect(await counts()).toMatchObject({ attendees: 0, posts: 0 })

    const seeded = await Promise.all([request('fill', 1), request('fill', 1)])
    expect(seeded.map(status).sort()).toEqual(['blocked', 'filled'])
    expect(await counts()).toEqual({
      attendees: 200, posts: 70, replies: 140, questions: 40, answered: 8, likes: 260, open_rounds: 1, raffles: 1, messages: 1,
    })
    const boards = await db.prepare("SELECT DISTINCT section FROM meetup15_discussion WHERE kind = 'post'").all<{section: string}>()
    expect(boards.results.map(row => row.section).sort()).toEqual(Object.keys(MEETUP_SECTIONS).sort())
    expect(await db.prepare('SELECT json_array_length(candidates) AS size FROM meetup15_raffles').first('size')).toBe(200)
    expect(await state()).toMatchObject({ admission_open: 0, revision: 2, section_override: 'expert', projection_mode: 'hidden', projection_round_id: null })
    expect(status(await request('clear', 1))).toBe('changed')
    expect(status(await request('clear', 2))).toBe('cleared')
    expect(await counts()).toEqual({
      attendees: 0, posts: 0, replies: 0, questions: 0, answered: 0, likes: 0, open_rounds: 0, raffles: 0, messages: 0,
    })
    expect((await guests()).results).toEqual(guestBefore.results)
    expect(await db.prepare('SELECT metrics FROM meetup15_summary').first('metrics')).toBe('{"posts":123}')

    expect(REHEARSAL_END).toBe(Date.parse('2026-11-14T12:45:00+01:00'))
    expect(status(await request('fill', 3))).toBe('filled')
    await db.prepare('UPDATE activity_state SET admission_open = 1, revision = revision + 1').run()
    expect(status(await request('clear', 5))).toBe('closed')
    await db.prepare('UPDATE activity_state SET admission_open = 0, revision = revision + 1').run()
    expect(status(await request('clear', 6))).toBe('closed')
    expect(status(await request('fill', 6))).toBe('closed')
    expect(await counts()).toMatchObject({ attendees: 200, posts: 70, questions: 40 })
  } finally {
    await runtime.dispose()
  }
})
