#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  target: { type: 'string', default: 'http://127.0.0.1:52335' },
  run: { type: 'string' },
  client: { type: 'string' },
  users: { type: 'string', default: '80' },
  seconds: { type: 'string', default: '120' },
  'start-at': { type: 'string' },
  questions: { type: 'boolean' },
  'allow-remote': { type: 'boolean' },
  output: { type: 'string' },
} })

const origin = new URL(values.target).origin
const target = new URL(origin)
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
if (!local && (!values['allow-remote'] || target.protocol !== 'https:')) {
  throw new Error('Remote targets require HTTPS and --allow-remote')
}
for (const field of ['run', 'client']) {
  if (!/^[a-zA-Z0-9_-]{1,8}$/.test(values[field] ?? '')) throw new Error('Provide --' + field + ' (1–8 letters, digits, _ or -)')
}
function integer(value, min, max, name) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(name + ' must be between ' + min + ' and ' + max)
  return number
}
const users = integer(values.users, 1, 200, '--users')
const duration = integer(values.seconds, 10, 900, '--seconds')
const requestedStart = values['start-at'] ? Date.parse(values['start-at']) : null
if (requestedStart !== null && (!/(?:Z|[+-]\d\d:\d\d)$/.test(values['start-at']) ||
    !Number.isFinite(requestedStart) || requestedStart <= Date.now())) throw new Error('--start-at must be a future ISO time with timezone')
const password = process.env.DAMS_ENTRY_PASSWORD
delete process.env.DAMS_ENTRY_PASSWORD
if (!password) throw new Error('Set DAMS_ENTRY_PASSWORD to the audience admission password')
const label = 'LT-' + values.run + '-' + values.client
const file = values.output ?? label + '.json'
const config = { scenario: 'meetup15-http-v1', run: values.run, client: values.client, users,
  duration_s: duration, target: origin, questions: Boolean(values.questions),
  registrationStartedAt: new Date().toISOString(), requestedStart: values['start-at'] ?? null }
const counters = {}
const samples = {}
const failures = {}
const summary = { config, counters, samples, failures, members: [] }
const increment = (key) => { counters[key] = (counters[key] ?? 0) + 1 }
const section = 'lounge'
const feed = '/api/discussion?section=' + section

async function request(stage, path, { cookie, form, data, expected = 200, check } = {}) {
  const headers = { Origin: origin }
  if (cookie) headers.Cookie = cookie
  if (data) headers['Content-Type'] = 'application/json'
  const start = performance.now()
  increment(stage + '_attempt')
  try {
    const response = await fetch(origin + path, {
      method: form || data ? 'POST' : 'GET', headers,
      body: form ? new URLSearchParams(form) : data ? JSON.stringify(data) : undefined,
      redirect: 'manual', signal: AbortSignal.timeout(12000),
    })
    if (response.status !== expected) {
      await response.body?.cancel()
      throw new Error('HTTP ' + response.status)
    }
    const result = expected === 200 ? await response.json() : response
    check?.(result)
    const durations = samples[stage] ??= []
    durations.push(Math.round(performance.now() - start))
    increment(stage + '_ok')
    return result
  } catch (error) {
    increment(stage + '_failed')
    const key = stage + ': ' + (error.cause?.code ?? error.message)
    failures[key] = (failures[key] ?? 0) + 1
    return null
  }
}
const send = (stage, cookie, data) => request(stage, '/api/discussion', { cookie, data, expected: 204 })
function feedRead(cookie, path = feed, stage = 'feed') {
  return request(stage, path, { cookie, check(data) {
    if (!Array.isArray(data.items)) throw new Error('Invalid feed response')
  } })
}
function launchAt(epoch) {
  return sleep(Math.max(0, epoch - Date.now()))
}

async function register(index) {
  const entered = await request('entry', '/api/meetup/enter', {
    form: { method: 'password', credential: password }, expected: 303,
    check(response) {
      const location = response.headers.get('location')
      if (location !== '/feed') throw new Error('Admission redirect: ' + (location ?? 'missing'))
      if (!response.headers.getSetCookie().some(value => value.startsWith('dams-meetup-15-member='))) throw new Error('Missing member cookie')
    },
  })
  if (!entered) return null
  const cookie = entered.headers.getSetCookie().find(value => value.startsWith('dams-meetup-15-member=')).split(';')[0]
  const id = JSON.parse(Buffer.from(cookie.split('.')[1], 'base64url')).value
  const nickname = label + '-' + (index + 1)
  summary.members.push({ id, nickname })
  const named = await send('nickname', cookie, { action: 'nickname', name: nickname })
  return named ? { index, cookie, nickname } : null
}

async function run() {
  const members = []
  for (let index = 0; index < users; index += 4) {
    const batch = await Promise.all(Array.from({ length: Math.min(4, users - index) }, (_, offset) => register(index + offset)))
    members.push(...batch.filter(Boolean))
    if (index === 0 && !members.length) throw new Error('Admission setup failed: ' + JSON.stringify(failures))
    await sleep(250)
  }
  config.registered = members.length
  if (members.length !== users) throw new Error('Only ' + members.length + '/' + users + ' users registered; synchronized workload cancelled')
  console.log(label + ' registered ' + members.length + ' users at ' + origin)
  const start = requestedStart ?? Date.now()
  if (requestedStart !== null && Date.now() >= start) throw new Error('Registration missed the scheduled start')
  const end = start + duration * 1000

  await launchAt(start)
  config.startedAt = new Date().toISOString()
  if (values.questions) {
    const snapshot = await feedRead(members[0].cookie, feed, 'question_setup')
    const round = snapshot?.activeRound
    if (!round) throw new Error('Open a Q&A round before the scheduled start')
    await Promise.all(members.flatMap(({ cookie, nickname }) => [
      send('question', cookie, { action: 'question', section: round.section, roundId: round.id, body: nickname + ' 测试提问' }),
      feedRead(cookie, '/api/discussion?section=' + encodeURIComponent(round.section), 'peak_refresh'),
    ]))
  }
  const authors = members.slice(0, Math.max(1, Math.ceil(users / 10)))
  await Promise.all(authors.map(({ cookie, nickname }) =>
    send('post', cookie, { action: 'post', section, body: nickname + ' 测试帖', tags: '压测' })))
  const snapshot = await feedRead(members[0].cookie, feed, 'fixture_read')
  const fixture = snapshot?.items.find(item => authors.some(author => item.body === author.nickname + ' 测试帖'))
  if (!fixture) throw new Error('This client’s test post was not found')

  const behaviorStart = Date.now()
  await Promise.all(members.map(async ({ index, cookie, nickname }) => {
    await launchAt(behaviorStart + index / users * 5000)
    if (Date.now() >= end) return
    await request('presence', '/api/personal/presence', { cookie, data: {}, expected: 204 })
    if (index % 4 === 0) await send('like', cookie, { action: 'like', id: fixture.id, liked: true })
    if (index % 5 === 0) await send('reply', cookie, { action: 'reply', postId: fixture.id, parentId: null, body: nickname + ' 测试回复' })
    let next = Date.now()
    while (next < end) {
      await launchAt(next)
      if (Date.now() >= end) break
      await feedRead(cookie)
      if (index % 4 === 0) await request('replies', '/api/discussion/replies?post=' + fixture.id + '&after=0', { cookie })
      next = Math.max(next + 8000, Date.now())
    }
  }))
}

try {
  await writeFile(file, '', { flag: 'wx' })
} catch (error) {
  throw new Error('Choose an unused report path: ' + file, { cause: error })
}
try {
  await run()
} catch (error) {
  summary.error = error.message
  console.error(error.message)
  process.exitCode = 1
} finally {
  config.finishedAt = new Date().toISOString()
  await writeFile(file, JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ counters, failures, report: file }))
  if (Object.keys(failures).length) process.exitCode = 1
}
