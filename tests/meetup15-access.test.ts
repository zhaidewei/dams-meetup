import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import { admissionCredentials, MEMBER_COOKIE, recoveryPath } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, signSessionCookie, verifySessionCookie } from '../src/lib/session-cookie-crypto'

it('isolates members and gates both first-entry methods without blocking guests or recovery', async () => {
  const now = Date.now()
  const secret = 'fixture-session-secret-for-meetup-15-only'
  const origin = 'http://localhost'
  const admin = `${ACTIVITY_ADMIN_COOKIE}=${signSessionCookie(
    ACTIVITY_ADMIN_COOKIE, '1', new Date(Date.now() + 60_000), secret,
  )}`
  const bundled = await build({
    stdin: {
      contents: `
        import { handleMeetupAccess } from './cloudflare/meetup-access'
        import { setAdmissionEnd } from './src/lib/meetup15/event'
        export default {
          fetch(request, env) {
            if (request.headers.has('X-Test-Deadline-Passed')) {
              setAdmissionEnd(${now} - 1000)
              return handleMeetupAccess(request, env, ${now} - 2000)
            }
            return handleMeetupAccess(request, env, ${now})
          }
        }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [{
      name: 'fixture-event-window',
      setup(build) {
        build.onLoad({ filter: /meetup15\/event\.ts$/ }, () => ({
          contents: `
            export let ADMISSION_END = ${now} + 60_000
            export const INTERACTION_END = ${now} + 120_000
            export function setAdmissionEnd(value) { ADMISSION_END = value }
          `,
          loader: 'js',
        }))
      },
    }],
  })
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'meetup.mjs', contents: bundled.outputFiles[0].text }],
    compatibilityDate: '2026-04-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACTIVITY_DB: 'fixture-meetup15' },
    bindings: { SESSION_SECRET: secret },
    ratelimits: {
      ACTIVITY_LOGIN_LIMIT: { namespace_id: '1011', simple: { limit: 15, period: 60 } },
      ACTIVITY_ENTRY_LIMIT: { namespace_id: '1012', simple: { limit: 600, period: 60 } },
    },
  }))

  const post = (path: string, fields: Record<string, string>, cookie = '', extraHeaders = {}) =>
    runtime.dispatchFetch(`${origin}/api/meetup/${path}`, {
      method: 'POST', redirect: 'manual', headers: { Origin: origin, Cookie: cookie, ...extraHeaders },
      body: new URLSearchParams(fields),
    })
  const screen = (cookie = '') => runtime.dispatchFetch(`${origin}/api/meetup/screen`, {
    headers: { Cookie: cookie },
  })
  const cookie = (response: Awaited<ReturnType<typeof post>>) => response.headers.get('Set-Cookie')?.split(';', 1)[0] ?? ''
  const memberId = (value: string) => verifySessionCookie(
    MEMBER_COOKIE, value.slice(MEMBER_COOKIE.length + 1), secret, now,
  )

  try {
    const db = await runtime.getD1Database('ACTIVITY_DB')
    const filenames = ['0001_activity_state.sql', '0002_meetup15_members.sql']
    for (const file of filenames) {
      const sql = await readFile(`migrations/${file}`, 'utf8')
      await db.batch(sql.split(';').map((statement) => statement.trim()).filter(Boolean)
        .map((statement) => db.prepare(statement)))
    }
    const credentials = admissionCredentials(secret)
    const manual = { method: 'password', credential: credentials.password }
    const qr = { method: 'qr', credential: credentials.qr }
    expect((await screen()).status).toBe(401)
    expect(await (await screen(admin)).json()).toEqual({ open: false })
    expect((await post('enter', manual)).headers.get('Location')).toBe('/?entry=closed')
    expect((await post('enter', qr)).headers.get('Location')).toBe('/?entry=closed')

    const guest = { username: 'guest-15', displayName: '嘉宾测试', title: '测试头衔', password: 'fixture-guest-pass' }
    expect((await post('guests', guest)).status).toBe(401)
    expect((await post('guests', guest, admin)).headers.get('Location')).toBe('/admin/activity?guest=saved')
    expect((await post('guest-login', { ...guest, password: 'wrong' })).headers.get('Location')).toBe('/vip-login?error=1')
    const guestA = memberId(cookie(await post('guest-login', guest)))
    expect(guestA).toBeTruthy()
    expect(memberId(cookie(await post('guest-login', guest)))).toBe(guestA)

    await db.prepare('UPDATE activity_state SET admission_open = 1').run()
    expect((await screen()).status).toBe(401)
    expect(await (await screen(admin)).json()).toMatchObject({
      open: true, password: credentials.password, qrPath: `/auto-login#qr=${credentials.qr}`,
    })
    const attendeeA = cookie(await post('enter', manual))
    const attendeeB = cookie(await post('enter', qr))
    const id = memberId(attendeeA)
    expect(id).toBeTruthy()
    expect(memberId(attendeeB)).toBeTruthy()
    expect(memberId(attendeeB)).not.toBe(id)
    expect(await db.prepare('SELECT display_name FROM meetup15_members WHERE id = ?').bind(id).first())
      .toEqual({ display_name: null })

    await db.prepare('UPDATE activity_state SET admission_open = 0').run()
    expect((await post('enter', manual)).headers.get('Location')).toBe('/?entry=closed')
    expect((await post('enter', qr)).headers.get('Location')).toBe('/?entry=closed')
    expect((await post('enter', manual, attendeeA)).headers.get('Location')).toBe('/feed')
    expect(await (await screen(admin)).json()).toEqual({ open: false })

    const link = new URL(recoveryPath(id!, secret), origin)
    const params = new URLSearchParams(link.hash.slice(1))
    const recovery = { id: params.get('u')!, token: params.get('t')! }
    expect(memberId(cookie(await post('recover', recovery)))).toBe(id)
    const rejectedSwitch = await post('recover', recovery, attendeeB)
    expect(rejectedSwitch.headers.get('Location')).toBe('/?entry=already')
    expect(cookie(rejectedSwitch)).toBe('')
    expect((await post('recover', recovery, attendeeA)).headers.get('Location')).toBe('/feed')
    expect((await post('recover', { id: id!, token: 'legacy' })).headers.get('Location')).toBe('/?entry=recovery')
    const old = `dams-uid=${signSessionCookie('dams-uid', id!, new Date(now + 60_000), secret)}`
    expect((await post('enter', manual, old)).headers.get('Location')).toBe('/?entry=closed')
    // 请求开始时未截止，SQLite 执行时已截止，手动开关仍开启。
    await db.prepare('UPDATE activity_state SET admission_open = 1').run()
    for (const entry of [manual, qr]) {
      const rejected = await post('enter', entry, '', { 'X-Test-Deadline-Passed': '1' })
      expect(rejected.headers.get('Location')).toBe('/?entry=closed')
      expect(cookie(rejected)).toBe('')
    }
    expect((await db.prepare('SELECT COUNT(*) AS count FROM meetup15_members').first())?.count).toBe(3)
  } finally {
    await runtime.dispose()
  }
}, 20_000)
