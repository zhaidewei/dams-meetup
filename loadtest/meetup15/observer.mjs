import app from './worker.js'
export { ActivityUpdates } from './worker.js'

const totals = Object.create(null)
async function timed(samples, operation) {
  const start = performance.now()
  try { return await operation() } finally { samples.push(performance.now() - start) }
}

function trackedDb(db, counts) {
  const unwrap = new WeakMap()
  const record = response => {
    counts.statements++
    counts.rowsRead += response.meta?.rows_read ?? 0
    counts.rowsWritten += response.meta?.rows_written ?? 0
    return response
  }
  const wrap = statement => {
    const observed = {
      bind(...args) { return wrap(statement.bind(...args)) },
      async all() { return record(await timed(counts.d1Ms, () => statement.all())) },
      async run() { return record(await timed(counts.d1Ms, () => statement.run())) },
      async first(column) {
        const row = (await observed.all()).results[0]
        if (!row || column === undefined) return row ?? null
        if (!Object.hasOwn(row, column)) throw new Error('D1 column missing')
        return row[column]
      },
      raw(...args) { return statement.raw(...args) },
    }
    unwrap.set(observed, statement)
    return observed
  }
  return {
    prepare(sql) { return wrap(db.prepare(sql)) },
    async batch(statements) { return (await timed(counts.d1Ms, () => db.batch(statements.map(statement => unwrap.get(statement))))).map(record) },
    exec(...args) { return db.exec(...args) },
    withSession(...args) { return db.withSession(...args) },
  }
}

const observer = {
  async fetch(request, env, context) {
    const { hostname, pathname } = new URL(request.url)
    const allowed = hostname === '127.0.0.1' ||
      (env.DAMS_M6_OBSERVER_TOKEN && request.headers.get('X-M6-Observer-Token') === env.DAMS_M6_OBSERVER_TOKEN)
    if (!allowed) {
      if (pathname.startsWith('/__m6_')) return new Response(null, { status: 404 })
      return app.fetch(request, env, context)
    }
    if (pathname === '/__m6_isolation') {
      const count = await env.ACTIVITY_DB.prepare(`
        SELECT (SELECT COUNT(*) FROM meetup15_members) + (SELECT COUNT(*) FROM meetup15_discussion)
          + (SELECT COUNT(*) FROM meetup15_qa_rounds) + (SELECT COUNT(*) FROM meetup15_raffles)
          + (SELECT admission_open FROM activity_state WHERE id=1) AS fixtureCount
      `).first('fixtureCount')
      return Response.json({ fresh: count === 0 })
    }
    if (pathname === '/__m6_d1_stats') return Response.json(totals)
    if (pathname === '/__m6_d1_reconcile') {
      const row = await env.ACTIVITY_DB.prepare(`
        SELECT
          (SELECT COUNT(*) FROM meetup15_members WHERE role='attendee') AS attendees,
          (SELECT COUNT(*) FROM meetup15_discussion WHERE kind='question') AS questions,
          (SELECT COUNT(*) FROM meetup15_discussion_likes) AS likes,
          (SELECT COUNT(*) FROM meetup15_raffles WHERE winner_id IS NOT NULL) AS winners,
          (SELECT COUNT(*) FROM meetup15_dm_messages WHERE raffle_id IS NOT NULL) AS prizeMessages,
          (SELECT admission_open FROM activity_state WHERE id=1) AS admissionOpen
      `).first()
      return Response.json(row)
    }
    const key = request.headers.get('X-M6-Stage') ?? 'browser ' + request.method + ' ' + pathname
    const counts = totals[key] ??= { requests: 0, statements: 0, rowsRead: 0, rowsWritten: 0, workerMs: [], d1Ms: [], notificationMs: [], cache: {} }
    counts.requests++
    const namespace = env.ACTIVITY_UPDATES
    const updates = {
      getByName(name) {
        const stub = namespace.getByName(name)
        return new Proxy(stub, {
          get(target, key) {
            if (key === 'queueDiscussionUpdate') return () => timed(counts.notificationMs, () => target.queueDiscussionUpdate())
            const value = Reflect.get(target, key, target)
            return typeof value === 'function' ? (...args) => target[key](...args) : value
          },
        })
      },
    }
    const sample = { statements: 0, rowsRead: 0, rowsWritten: 0, d1Ms: [] }
    const started = performance.now()
    const response = await app.fetch(request, { ...env,
      ACTIVITY_DB: trackedDb(env.ACTIVITY_DB, sample), ACTIVITY_UPDATES: updates }, context)
    const workerMs = performance.now() - started
    counts.workerMs.push(workerMs)
    counts.d1Ms.push(...sample.d1Ms)
    counts.statements += sample.statements
    counts.rowsRead += sample.rowsRead
    counts.rowsWritten += sample.rowsWritten
    for (const metric of response.headers.get('Server-Timing')?.split(', ') ?? []) {
      counts.cache[metric] = (counts.cache[metric] ?? 0) + 1
    }
    if (response.status === 101) return response
    const responseHeaders = new Headers(response.headers)
    const d1Ms = sample.d1Ms.reduce((sum, duration) => sum + duration, 0)
    responseHeaders.append('Server-Timing', `worker;dur=${workerMs.toFixed(1)}, d1;dur=${d1Ms.toFixed(1)}`)
    return new Response(response.body, { status: response.status, headers: responseHeaders })

  },
}

export default observer
