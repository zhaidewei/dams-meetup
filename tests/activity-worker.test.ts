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
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: [{ type: 'ESModule', path: 'activity.mjs', contents: entry.outputFiles[0].text }],
    compatibilityDate: '2026-04-01',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { ACTIVITY_DB: 'fixture-activity' },
    durableObjects: {
      ACTIVITY_UPDATES: { className: 'ActivityUpdates', useSQLite: true },
    },
    bindings: { SESSION_SECRET: secret },
  }))

  const origin = 'http://localhost'
  const url = `${origin}/api/activity`
  const token = signSessionCookie(ADMIN_COOKIE_NAME, '1', new Date(Date.now() + 60_000), secret)
  const cookie = `${ADMIN_COOKIE_NAME}=${token}`
  const headers = { Cookie: cookie, Origin: origin }
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
    expect((await runtime.dispatchFetch(`${url}/updates`, {
      headers: { Upgrade: 'websocket', Origin: origin },
    })).status).toBe(401)
    expect((await runtime.dispatchFetch(url, {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://other.example' },
      body: JSON.stringify({ admissionOpen: true }),
    })).status).toBe(403)
    expect((await runtime.dispatchFetch(`${url}/updates`, {
      headers: { Cookie: cookie, Origin: 'https://other.example', Upgrade: 'websocket' },
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
