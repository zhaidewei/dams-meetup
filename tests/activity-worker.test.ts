import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import { ADMIN_COOKIE_NAME, signSessionCookie } from '../src/lib/session-cookie-crypto'

it('initializes a closed event, publishes committed changes and restores state on reconnect', async () => {
  const entry = await build({
    stdin: {
      contents: `
        import { handleActivityRequest } from './cloudflare/activity'
        export { ActivityUpdates } from './cloudflare/activity'
        export default { fetch: handleActivityRequest }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['cloudflare:workers'],
    write: false,
  })
  const secret = 'fixture-key-for-local-worker-testing-only'
  const adminPassword = 'fixture-admin-password'
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'activity.mjs', contents: entry.outputFiles[0].text }],
    compatibilityDate: '2026-04-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACTIVITY_DB: 'fixture-activity' },
    durableObjects: {
      ACTIVITY_UPDATES: { className: 'ActivityUpdates', useSQLite: true },
    },
    bindings: { SESSION_SECRET: secret, ADMIN_TOKEN: adminPassword },
    ratelimits: { ACTIVITY_LOGIN_LIMIT: { namespace_id: '1001', simple: { limit: 15, period: 60 } } },
  }))

  const origin = 'http://localhost'
  const url = `${origin}/api/activity`
  const login = (password: string, requestOrigin = origin) => runtime.dispatchFetch(`${url}/session`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: requestOrigin },
    body: new URLSearchParams({ token: password }),
  })
  const headers = { Cookie: '', Origin: origin }
  const change = (admissionOpen: boolean) => runtime.dispatchFetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ admissionOpen }),
  })
  const connect = () => runtime.dispatchFetch(`${url}/updates`, {
    headers: { ...headers, Upgrade: 'websocket' },
  })

  try {
    const migration = await readFile('migrations/0001_activity_state.sql', 'utf8')
    const db = await runtime.getD1Database('ACTIVITY_DB')
    await db.batch(migration.split(';').map((sql) => sql.trim()).filter(Boolean).map((sql) => db.prepare(sql)))
    expect((await runtime.dispatchFetch(url)).status).toBe(401)
    expect((await login(adminPassword, 'https://other.example')).status).toBe(403)
    const rejected = await login('incorrect')
    expect(rejected.headers.get('Location')).toBe('/admin/activity?error=1')
    expect(rejected.headers.get('Set-Cookie')).toBeNull()
    const loggedIn = await login(adminPassword)
    expect(loggedIn.status).toBe(303)
    expect(loggedIn.headers.get('Location')).toBe('/admin/activity')
    expect(loggedIn.headers.get('Set-Cookie')).toMatch(/^dams-meetup-15-admin=.*; Secure; HttpOnly; SameSite=Lax$/)
    headers.Cookie = loggedIn.headers.get('Set-Cookie')!.split(';', 1)[0]
    const oldToken = signSessionCookie(ADMIN_COOKIE_NAME, '1', new Date(Date.now() + 60_000), secret)
    expect((await runtime.dispatchFetch(url, {
      headers: { Cookie: `${ADMIN_COOKIE_NAME}=${oldToken}` },
    })).status).toBe(401)
    expect((await runtime.dispatchFetch(`${url}/updates`, {
      headers: { Upgrade: 'websocket', Origin: origin },
    })).status).toBe(401)
    expect((await runtime.dispatchFetch(url, {
      method: 'PATCH',
      headers: { Cookie: headers.Cookie, Origin: 'https://other.example' },
      body: JSON.stringify({ admissionOpen: true }),
    })).status).toBe(403)
    expect((await runtime.dispatchFetch(`${url}/updates`, {
      headers: { Cookie: headers.Cookie, Origin: 'https://other.example', Upgrade: 'websocket' },
    })).status).toBe(403)
    expect(await (await runtime.dispatchFetch(url, { headers })).json())
      .toEqual({ admissionOpen: false, revision: 0 })

    const upgraded = await connect()
    expect(upgraded.status).toBe(101)
    const socket = upgraded.webSocket!
    socket.accept()
    const notification = new Promise<unknown>((resolve) => {
      socket.addEventListener('message', (message) => resolve(message.data), { once: true })
    })
    expect(await (await change(true)).json()).toEqual({ admissionOpen: true, revision: 1 })
    expect(await notification).toBe('activity.updated')
    expect(await (await runtime.dispatchFetch(url, { headers })).json())
      .toEqual({ admissionOpen: true, revision: 1 })
    expect(await (await change(true)).json()).toEqual({ admissionOpen: true, revision: 1 })
    const closed = new Promise<number>((resolve) => {
      socket.addEventListener('close', (event) => resolve(event.code), { once: true })
    })
    socket.close(1000)
    expect(await closed).toBe(1000)

    expect(await (await change(false)).json()).toEqual({ admissionOpen: false, revision: 2 })
    const reconnected = await connect()
    expect(reconnected.status).toBe(101)
    reconnected.webSocket!.accept()
    expect(await (await runtime.dispatchFetch(url, { headers })).json())
      .toEqual({ admissionOpen: false, revision: 2 })
    reconnected.webSocket!.close()
  } finally {
    await runtime.dispose()
  }
}, 15_000)
