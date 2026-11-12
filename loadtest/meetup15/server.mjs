import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
const root = resolve(import.meta.dirname, '../..')
const run = resolve(process.argv[2])
const name = 'dams-meetup'
const mf = new Miniflare(convertV4MiniflareOptions({
  name,
  host: '127.0.0.1',
  port: 0,
  modulesRoot: resolve(run, 'bundle'),
  modules: [
    { type: 'ESModule', path: resolve(run, 'bundle/m6-observer.mjs') },
    { type: 'ESModule', path: resolve(run, 'bundle/worker.js') },
  ],
  compatibilityDate: '2026-04-01',
  compatibilityFlags: ['nodejs_compat','global_fetch_strictly_public'],
  d1Databases: { ACTIVITY_DB: 'isolated-meetup-m6' },
  durableObjects: { ACTIVITY_UPDATES: { className: 'ActivityUpdates', useSQLite: true } },
  serviceBindings: { WORKER_SELF_REFERENCE: name },
  ratelimits: {
    ACTIVITY_LOGIN_LIMIT: { namespace_id: '2026111415', simple: { limit: 15, period: 60 } },
    ACTIVITY_ENTRY_LIMIT: { namespace_id: '2026111416', simple: { limit: 600, period: 60 } },
  },
  assets: { directory: resolve(root, '.open-next/assets'), binding: 'ASSETS', routerConfig: { has_user_worker: true } },
  bindings: { ADMIN_TOKEN: 'dams-local-admin', SESSION_SECRET: 'dams-local-fixture-signing-key-never-production' },
}))

;(async () => {
  const db = await mf.getD1Database('ACTIVITY_DB')
  for (const file of (await readdir(resolve(root, 'migrations'))).sort()) {
    const sql = await readFile(resolve(root, 'migrations', file), 'utf8')
    await db.batch(sql.trim().split(/;\s*\n(?=(?:CREATE|ALTER|INSERT|UPDATE)\b)/).map(statement => db.prepare(statement)))
  }
  console.log('Direct Miniflare ready: ' + await mf.ready)
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await mf.dispose(); process.exit(0) })
  }
  await new Promise(() => {})
})().catch(async error => { console.error(error); await mf.dispose(); process.exitCode = 1 })
