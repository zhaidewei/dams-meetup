import app from './worker.js'
export { ActivityUpdates } from './worker.js'

const totals = Object.create(null)
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
      async all() { return record(await statement.all()) },
      async run() { return record(await statement.run()) },
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
    async batch(statements) { return (await db.batch(statements.map(statement => unwrap.get(statement)))).map(record) },
    exec(...args) { return db.exec(...args) },
    withSession(...args) { return db.withSession(...args) },
  }
}

const observer = {
  async fetch(request, env, context) {
    const pathname = new URL(request.url).pathname
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
    const counts = totals[key] ??= { requests: 0, statements: 0, rowsRead: 0, rowsWritten: 0 }
    counts.requests++
    return app.fetch(request, { ...env, ACTIVITY_DB: trackedDb(env.ACTIVITY_DB, counts) }, context)
  },
}

export default observer
