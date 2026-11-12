import assert from "node:assert/strict"
import { AsyncLocalStorage } from "node:async_hooks"
import { channel } from "node:diagnostics_channel"
import fs from "node:fs"
import path from "node:path"
import { watchLiveQa } from "./live-qa.mjs"
import { FIELD_BROWSER_MEMBERS, FIELD_LIKES, FIELD_QUESTIONS, runFieldQa } from "./field-qa.mjs"
import { chromium } from "playwright"
import { Agent } from "undici"
const connections = Number(process.env.DAMS_M6_CONNECTIONS) || 0
const dispatcher = connections ? new Agent({ connections, pipelining: 1 }) : undefined
import WebSocket from "ws"

const base = process.argv[3]
const remote = process.env.DAMS_M6_REMOTE === '1'
const field = process.env.DAMS_M6_FIELD === '1'
const withRehearsal = field || process.env.DAMS_M6_REHEARSAL === '1'
if (remote) {
  assert.match(base, /^https:\/\/dams-meetup-perf-85-[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/)
  assert.ok(process.env.DAMS_M6_ADMIN_TOKEN && process.env.DAMS_M6_OBSERVER_TOKEN)
  if (withRehearsal) assert.ok(process.env.DAMS_M6_SESSION_SECRET, 'Use the isolated Worker session key')
} else {
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/)
}
const output = process.argv[2]
const handshakeBatch = Number(process.env.DAMS_WS_BATCH ?? 25)
assert.ok(Number.isInteger(handshakeBatch) && handshakeBatch >= 1 && handshakeBatch <= 200)
const wsUrl = new URL('/api/discussion/updates', base)
wsUrl.protocol = remote ? 'wss:' : 'ws:'
const testLiveUpdates = field || process.env.DAMS_M6_LIVE_UPDATES === '1'
if (testLiveUpdates) wsUrl.searchParams.set('qa', 'member')
let liveWatch
const USERS = 200
const indices = Array.from({ length: USERS }, (_, i) => i)
const runs = {}
const requestTiming = new AsyncLocalStorage()
const requestSamples = new WeakMap()
channel('undici:request:create').subscribe(({ request }) => {
  const sample = requestTiming.getStore()
  if (sample) requestSamples.set(request, sample)
})
channel('undici:client:sendHeaders').subscribe(({ request }) => {
  const sample = requestSamples.get(request)
  if (sample) sample.sentAt = performance.now()
})
const statusCounts = {}
const failures = []
const sockets = new Set()
const expectedClose = new WeakSet()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const percentile = (sorted, p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]
const round = n => Number(n.toFixed(1))

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  return { n: sorted.length, p50: round(percentile(sorted, .5)), p95: round(percentile(sorted, .95)),
    p99: round(percentile(sorted, .99)), max: round(sorted.at(-1)), over2s: sorted.filter(x => x > 2000).length }
}
async function request(stage, route, { cookie, method = 'GET', form, json, expect = 200, versions } = {}) {
  const start = performance.now()
  const headers = { Origin: base, 'X-M6-Stage': stage }
  if (cookie) headers.Cookie = cookie
  if (remote) headers['X-M6-Observer-Token'] = process.env.DAMS_M6_OBSERVER_TOKEN
  if (versions !== undefined) headers['X-Discussion-Versions'] = versions
  if (json) headers['Content-Type'] = 'application/json'
  try {
    const timing = {}
    const response = await requestTiming.run(timing, () => fetch(base + route, { method, headers,
      body: json ? JSON.stringify(json) : form ? new URLSearchParams(form) : undefined,
      redirect: 'manual', dispatcher, signal: AbortSignal.timeout(15000) }))
    const text = await response.text()
    const data = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text
    const key = String(response.status)
    statusCounts[key] = (statusCounts[key] || 0) + 1
    if (response.status !== expect) failures.push({ stage, status: response.status, error: typeof data === 'object' ? data?.error : undefined })
    assert.equal(response.status, expect, stage)
    return { response, data, elapsed: performance.now() - start, ack: Date.now(),
      queued: timing.sentAt === undefined ? undefined : timing.sentAt - start, bytes: Buffer.byteLength(text), serverTiming: response.headers.get('Server-Timing') ?? '' }
  } catch (error) {
    if (error.code !== 'ERR_ASSERTION') failures.push({ stage, error: error.message, cause: error.cause?.code, detail: error.cause?.message })
    throw error
  }
}
const post = (stage, route, cookie, json, expect = 204) =>
  request(stage, route, { cookie, method: 'POST', json, expect })
const get = (stage, route, cookie) => request(stage, route, { cookie })
const feedSnapshots = new Map()
async function getFeed(stage, cookie) {
  const previous = feedSnapshots.get(cookie)
  const versions = previous?.versions
  const result = await request(stage, '/api/discussion', {
    cookie, versions: versions ? `${versions.questions},${versions.posts}` : ',',
  })
  const data = { ...result.data,
    questions: result.data.questions ?? previous?.questions,
    items: result.data.items ?? previous?.items,
  }
  assert.ok(data.questions && data.items, stage + ' missing feed state')
  if (data.questionDelta) {
    const merged = new Map(data.questions.map(question => [question.id, question]))
    for (const id of data.questionDelta.remove) merged.delete(id)
    for (const question of data.questionDelta.upsert) merged.set(question.id, question)
    data.questions = [...merged.values()].sort((a, b) =>
      Number(a.answered) - Number(b.answered) || b.likes - a.likes || a.createdAt - b.createdAt || a.id - b.id)
  }
  const current = feedSnapshots.get(cookie)
  if (current && current !== previous) return { ...result, data: current }
  feedSnapshots.set(cookie, data)
  return { ...result, data }
}
const cookieFrom = response => response.headers.getSetCookie()[0]?.split(';', 1)[0]
async function measure(stage, promises) {
  const results = await Promise.allSettled(promises)
  const fulfilled = results.filter(result => result.status === 'fulfilled').map(result => result.value)
  if (fulfilled.length) {
    const queues = fulfilled.flatMap(item => item.queued === undefined ? [] : [item.queued])
    const sizes = fulfilled.flatMap(item => item.bytes === undefined ? [] : [item.bytes])
    const worker = []
    const d1 = []
    const cache = {}
    for (const item of fulfilled) {
      for (const metric of item.serverTiming?.split(', ') ?? []) {
        const duration = metric.match(/^(worker|d1);dur=([0-9.]+)$/)
        if (duration) (duration[1] === 'worker' ? worker : d1).push(Number(duration[2]))
        else if (metric.includes(';desc=')) cache[metric] = (cache[metric] ?? 0) + 1
      }
    }
    runs[stage] = {
      ...(worker.length && { workerMs: stats(worker) }),
      ...(d1.length && { d1Ms: stats(d1) }),
      ...(Object.keys(cache).length && { cache }),
      ...stats(fulfilled.map(item => item.elapsed)),
      ...(queues.length && { clientDispatchMs: stats(queues) }),
      ...(sizes.length && { responseBytes: { ...stats(sizes), total: sizes.reduce((sum, bytes) => sum + bytes, 0) } }),
    }
  }
  assert.equal(fulfilled.length, results.length, stage)
  return fulfilled
}
function openSocket(cookie) {
  const start = performance.now()
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, { headers: { Cookie: cookie, Origin: base, 'X-M6-Stage': 'memberWebSocket' }, handshakeTimeout: 12000 })
    const result = { socket, received: 0, elapsed: 0 }
    sockets.add(socket)
    socket.on('message', message => {
      const payload = message.toString()
      if (payload === 'activity.updated' || payload.startsWith('{"type":"qa.updated"')) result.received++
      liveWatch?.receive(cookie, payload)
    })
    socket.on('error', error => { failures.push({ stage: 'WebSocket', error: error.message, cause: error.cause?.code, detail: error.cause?.message }); reject(error) })
    socket.once('close', code => {
      sockets.delete(socket)
      if (!expectedClose.has(socket)) failures.push({ stage: 'WebSocket', error: 'Unexpected close', code })
    })
    socket.once('open', () => { result.elapsed = performance.now() - start; resolve(result) })
  })
}
async function connectMembers(stage, members, hydrate) {
  const connected = []
  for (let offset = 0; offset < members.length; offset += handshakeBatch) {
    const batch = members.slice(offset, offset + handshakeBatch)
    connected.push(...await measure(stage + ' batch ' + (offset + 1), batch.map(async cookie => {
      const connected = await openSocket(cookie)
      hydrate?.(cookie)
      return connected
    })))
  }
  runs[stage] = stats(connected.map(entry => entry.elapsed))
  return connected
}

function disconnect({ socket }) {
  return new Promise(resolve => {
    if (socket.readyState === WebSocket.CLOSED) return resolve()
    expectedClose.add(socket)
    socket.once('close', resolve)
    socket.close(1000)
  })
}

;(async () => {
  const browser = await chromium.launch()
  let admin
  let openedGate = false
  let page
  let browser5xx = 0
  let projectionResults
  let reconciliation
  let onePrize
  let browserFeedback
  let liveQa
  try {
    if (remote) assert.deepEqual((await get('isolation preflight', '/__m6_isolation')).data, { fresh: true })
    const auth = await request('admin login', '/api/activity/session', { method: 'POST', form: { token: remote ? process.env.DAMS_M6_ADMIN_TOKEN : 'dams-local-admin' }, expect: 303 })
    admin = cookieFrom(auth.response)
    assert.ok(admin)
    assert.equal((await get('initial gate', '/api/activity', admin)).data.admissionOpen, false)
    const guest = await request('configure guest', '/api/meetup/guests', { cookie: admin, method: 'POST',
      form: { username: 'm6-fixture-guest', displayName: 'M6 测试嘉宾', password: 'm6-local-fixture-only' }, expect: 303 })
    assert.match(guest.response.headers.get('location'), /guest=saved/)
    const staff = (await get('qa admin', '/api/discussion/admin', admin)).data
    const guestId = staff.guests.find(row => row.name === 'M6 测试嘉宾').id
    let members
    let seededRoundId = null
    if (withRehearsal) {
      const state = (await get('read rehearsal revision', '/api/activity', admin)).data
      const filled = await request('fill rehearsal', '/api/admin/meetup-rehearsal', {
        method: 'POST', cookie: admin, form: { action: 'fill', revision: state.revision }, expect: 303,
      })
      assert.match(filled.response.headers.get('location'), /rehearsal=filled$/)
      const ids = (await get('read seeded members', '/__m6_rehearsal_members')).data
      assert.equal(new Set(ids).size, USERS)
      const { signSessionCookie } = await import('../../src/lib/session-cookie-crypto.ts')
      const { INTERACTION_END } = await import('../../src/lib/meetup15/event.ts')
      const key = remote ? process.env.DAMS_M6_SESSION_SECRET : 'dams-local-fixture-signing-key-never-production'
      const cookieName = 'dams-meetup-15-member'
      members = ids.map(id => cookieName + '=' + signSessionCookie(cookieName, id, new Date(INTERACTION_END), key))
      const seededRound = (await get('read rehearsal round', '/api/discussion/admin', admin)).data.activeRound
      assert.ok(seededRound)
      seededRoundId = seededRound.id
      await post('archive rehearsal round', '/api/discussion/admin', admin, { action: 'end', roundId: seededRoundId })
    } else {
      openedGate = true
      const { data: gate } = await request('open isolated gate', '/api/activity', { cookie: admin, method: 'PATCH', json: { admissionOpen: true } })
      assert.equal(gate.admissionOpen, true)
      const config = (await get('read QR', '/api/meetup/screen', admin)).data
      const qr = new URLSearchParams(new URL(config.qrPath, base).hash.slice(1)).get('qr')
      assert.ok(qr)
      const scans = []
      for (let offset = 0; offset < USERS; offset += 25) {
        scans.push(...await Promise.all(indices.slice(offset, offset + 25).map(() => request('qrEntry', '/api/meetup/enter', {
        method: 'POST', form: { method: 'qr', credential: qr }, expect: 303,
      }).then(result => {
        assert.equal(result.response.headers.get('location'), '/feed')
        assert.ok(cookieFrom(result.response))
        return result
      }))))
      }
      runs.qrEntry = stats(scans.map(scan => scan.elapsed))
      members = scans.map(item => cookieFrom(item.response))
      assert.equal(new Set(members).size, USERS)
      await request('close isolated gate', '/api/activity', { cookie: admin, method: 'PATCH', json: { admissionOpen: false } })
      openedGate = false
    }
    const baseline = (await get('database baseline', '/__m6_d1_reconcile')).data
    if (!withRehearsal) {
      await measure('nickname', members.map((cookie, i) => post('nickname', '/api/discussion', cookie,
        { action: 'nickname', name: 'M6 观众 ' + (i + 1) })))
    }
    await measure('presence', members.map(cookie => post('presence', '/api/personal/presence', cookie)))
    await post('start QA', '/api/discussion/admin', admin, { action: 'start', guestId, activeRoundId: null, latestRoundId: seededRoundId })
    const qa = (await get('active QA', '/api/discussion/admin', admin)).data.activeRound
    assert.ok(qa)
    await measure('initialFeed', members.map(cookie => getFeed('initialFeed', cookie)))
    if (field) {
      const background = members.slice(FIELD_BROWSER_MEMBERS)
      const fieldSockets = await connectMembers('initialWebSocket', background)
      let samples
      let periodicReads = 0
      const pendingReads = new Set()
      const poll = setInterval(() => {
        const cookie = background[periodicReads++ % background.length]
        const read = getFeed('field periodic refresh', cookie)
        pendingReads.add(read)
        void read.catch(() => {}).finally(() => pendingReads.delete(read))
      }, 15000 / background.length)
      try {
        samples = await runFieldQa({
          browser, base, admin, members: members.slice(0, FIELD_BROWSER_MEMBERS), online: () => sockets.size,
          onResponse: response => { if (response.status() >= 500) browser5xx++ },
          readRound: async () => (await get('field question lookup', '/api/discussion/admin', admin)).data,
          answer: id => post('field answer', '/api/discussion/admin', admin, { action: 'answer', id, answered: true }),
          like: (id, index) => post('field like', '/api/discussion', background[index], { action: 'like', id, liked: true }),
        })
      } finally {
        clearInterval(poll)
        await Promise.allSettled(pendingReads)
      }
      assert.equal(fieldSockets.filter(entry => entry.received > 0).length, background.length)
      const reconnecting = background.slice(0, 25)
      await Promise.all(fieldSockets.slice(0, reconnecting.length).map(disconnect))
      const probe = 'M6 现场断线期间新增的问题'
      await post('field offline probe', '/api/discussion', background.at(-1),
        { action: 'question', section: qa.section, roundId: qa.id, body: probe })
      await connectMembers('field reconnect', reconnecting)
      const feeds = await measure('field reconnect feed', reconnecting.map(cookie => getFeed('field reconnect feed', cookie)))
      const expected = new Set([...samples.map(sample => sample.label), probe])
      const reconnectMissing = feeds.filter(({ data }) =>
        new Set(data.questions.map(question => question.body).filter(body => expected.has(body))).size !== expected.size).length
      assert.equal(reconnectMissing, 0)
      const d1 = (await get('field database reconciliation', '/__m6_d1_reconcile')).data
      assert.deepEqual(d1, { ...baseline, questions: baseline.questions + FIELD_QUESTIONS + 1, likes: baseline.likes + FIELD_LIKES })
      assert.equal(browser5xx, 0)
      assert.deepEqual(failures, [])
      const out = {
        environment: base, commit: process.env.DAMS_M6_COMMIT, attendees: USERS, authors: 3, baseline, periodicReads,
        timings: Object.fromEntries(['own', 'other', 'projection'].map(key => [key, stats(samples.map(sample => sample[key]))])),
        reconnect: { clients: feeds.length, missing: reconnectMissing, feed: runs['field reconnect feed'] },
        samples, d1, failures, browser5xx,
      }
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(out, null, 2) + '\n')
      console.log(JSON.stringify(out))
      return
    }
    const initialSockets = await connectMembers('initialWebSocket', members)

    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
    const [name, value] = admin.split('=')
    await context.addCookies([{ name, value, url: base }])
    page = await context.newPage()
    page.on('response', response => { if (response.status() >= 500) browser5xx++ })
    await page.goto(base + '/screen')
    await page.getByRole('heading', { name: '嘉宾问答 · M6 测试嘉宾' }).waitFor()
    await page.evaluate(() => {
      window.m6SeenAt = {}
      const check = () => {
        const at = Date.now()
        for (const row of document.querySelectorAll('section[aria-label="嘉宾问答"] article[aria-label="当前最高票问题"] > p, ol[aria-label="接下来"] li > p')) {
          const label = row.textContent
          if (!(label in window.m6SeenAt)) window.m6SeenAt[label] = at
        }
      }
      new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true })
      check()
    })
    assert.equal(sockets.size, USERS)
    const labels = indices.map(i => 'M6 问题 ' + String(i + 1).padStart(3, '0'))
    const beforeLive = testLiveUpdates ? (await get('before live notifications', '/__m6_d1_stats')).data : null
    if (testLiveUpdates) liveWatch = watchLiveQa(members, labels, feedSnapshots, cookie => getFeed('liveNotificationFeed', cookie))
    const questionPosts = measure('question', members.map((cookie, i) => post('question', '/api/discussion', cookie,
      { action: 'question', section: qa.section, roundId: qa.id, body: labels[i] })))
    const fanout = liveWatch?.finished ??
      delay(180).then(() => measure('concurrentFeedRefresh', members.map(cookie => getFeed('concurrentFeedRefresh', cookie))))
    const [posted, delivery] = await Promise.all([questionPosts, fanout])
    if (testLiveUpdates) {
      const { samples, ...messages } = delivery
      liveWatch = undefined
      const after = (await get('after live notifications', '/__m6_d1_stats')).data
      const workerReads = after.liveNotificationFeed?.d1Ms.length ?? 0
      const objectReads = after.discussionDurableObject.d1Ms.length - beforeLive.discussionDurableObject.d1Ms.length
      liveQa = { visible: stats(samples), ...messages, workerReads, objectReads }
    }
    const questionView = (await get('question reconciliation', '/api/screen', admin)).data
    assert.equal(questionView.questions.length, USERS)
    const projectedLabels = questionView.questions.slice(0, 3).map(item => item.body)
    await page.waitForFunction(labels => {
      const shown = Array.from(document.querySelectorAll('section[aria-label="嘉宾问答"] article[aria-label="当前最高票问题"] > p, ol[aria-label="接下来"] li > p'), row => row.textContent)
      return shown.length === labels.length && labels.every((label, i) => shown[i] === label && window.m6SeenAt[label])
    }, projectedLabels, { timeout: 12000 })
    const seen = await page.evaluate(() => window.m6SeenAt)
    const lags = projectedLabels.map(label => seen[label] - posted[labels.indexOf(label)].ack)
    projectionResults = { ...stats(lags.map(lag => Math.max(0, lag))), alreadyVisibleAtAck: lags.filter(lag => lag < 0).length }
    assert.equal(sockets.size, USERS)
    const firstDeliveries = initialSockets.filter(entry => entry.received > 0).length
    assert.equal(firstDeliveries, USERS)

    const questionByBody = new Map(questionView.questions.map(item => [item.body, item.id]))
    const likeTarget = indices.map(i => i < 100 ? questionByBody.get(labels[0]) : questionByBody.get(labels[i]))
    const expectedLikes = new Map()
    for (const id of likeTarget) expectedLikes.set(id, (expectedLikes.get(id) || 0) + 1)
    await measure('like', members.map((cookie, i) => post('like', '/api/discussion', cookie,
      { action: 'like', id: likeTarget[i], liked: true })))
    await page.getByText('100 个赞', { exact: true }).waitFor()
    const top = await page.getByRole('article', { name: '当前最高票问题' }).textContent()
    assert.ok(top.includes(labels[0]))
    await Promise.all(initialSockets.map(disconnect))
    const offline = await post('question while offline', '/api/discussion', members[0],
      { action: 'question', section: qa.section, roundId: qa.id, body: 'M6 断线期间新增的问题' })
    runs.offlineProbeWrite = stats([offline.elapsed])
    await delay(3000)
    const reconnected = await connectMembers('reconnectWebSocket', members)
    const hydrated = await measure('reconnectFeed', members.map(cookie => getFeed('reconnectFeed', cookie)))
    for (const snapshot of hydrated) {
      assert.equal(snapshot.data.questions.length, USERS + 1)
      assert.ok(snapshot.data.questions.some(item => item.body === 'M6 断线期间新增的问题'))
      for (const q of snapshot.data.questions) assert.equal(q.likes, expectedLikes.get(q.id) || 0)
    }
    await Promise.all(reconnected.map(disconnect))
    await post('answer while offline', '/api/discussion/admin', admin, {
      action: 'answer', id: likeTarget[0], answered: true,
    })
    await page.getByRole('article', { name: '当前最高票问题' }).getByText(questionView.questions.find(item => expectedLikes.get(item.id) === 1).body, { exact: true }).waitFor()
    const recoveryStart = performance.now()
    const progressiveReads = []
    let progressive
    try {
      progressive = await connectMembers('progressiveWebSocket', members, cookie => {
        const read = getFeed('progressiveReconnectFeed', cookie)
          .then(result => ({ ...result, restored: performance.now() - recoveryStart }))
        progressiveReads.push(read)
        void read.catch(() => {})
      })
    } catch (error) {
      await Promise.allSettled(progressiveReads)
      throw error
    }
    const restored = await measure('progressiveReconnectFeed', progressiveReads)
    runs.progressiveReconnectVisible = stats(restored.map(result => result.restored))
    for (const snapshot of restored) {
      const top = snapshot.data.questions.find(item => item.id === likeTarget[0])
      assert.ok(top?.answered, 'Answered state missing after reconnect')
      const own = snapshot.data.questions.find(item => item.mine && labels.includes(item.body))
      assert.ok(own)
      const index = labels.indexOf(own.body)
      assert.ok(index >= 0)
      assert.equal(top.liked, index < 100, 'Shared snapshot must preserve per-viewer likes')
    }
    await post('end QA', '/api/discussion/admin', admin, { action: 'end', roundId: qa.id })
    await page.waitForFunction(() => document.querySelector('main')?.textContent === '')
    await delay(100)
    assert.equal(sockets.size, USERS)
    const reconnectionDeliveries = progressive.filter(entry => entry.received > 0).length
    assert.equal(reconnectionDeliveries, USERS)
    const historical = (await get('qa history', '/api/screen/preview?mode=qa&roundId=' + qa.id, admin)).data
    assert.equal(historical.questions.length, USERS + 1)
    await Promise.all(progressive.map(disconnect))
    reconciliation = { uniqueSessions: new Set(members).size, initialWebSocketEventRecipients: firstDeliveries,
      questionBroadcastsPerMember: Math.max(...initialSockets.map(entry => entry.received)), questions: historical.questions.length, likes: historical.questions.reduce((sum, item) => sum + item.likes, 0),
      expectedTopQuestionLikes: 100, reconnectEventRecipients: reconnectionDeliveries,
      reconnectSnapshots: hydrated.length, reconnectMissing: 0 }

    // A fresh round keeps every sample visible on the actual projection. Use two
    // browser sessions to time both the submitter and an independently connected viewer.
    const browserSamples = 12
    const clients = []
    for (const cookie of members.slice(0, 2)) {
      const [cookieName, cookieValue] = cookie.split('=')
      const viewer = await browser.newContext({ viewport: { width: 390, height: 844 } })
      await viewer.addCookies([{ name: cookieName, value: cookieValue, url: base }])
      const client = await viewer.newPage()
      client.on('response', response => { if (response.status() >= 500) browser5xx++ })
      clients.push(client)
    }
    await post('start browser feedback QA', '/api/discussion/admin', admin, {
      action: 'start', guestId, activeRoundId: null, latestRoundId: qa.id,
    })
    const feedbackRound = (await get('browser feedback QA', '/api/discussion/admin', admin)).data.activeRound
    await Promise.all(clients.map(client => client.goto(base + '/feed')))
    const [author, observer] = clients
    await Promise.all(clients.map(client => client.getByLabel('你的问题', { exact: true }).waitFor()))
    for (const target of [author, observer, page]) {
      await target.evaluate(() => {
        window.feedbackSeen = {}
        const check = () => {
          for (const p of document.querySelectorAll('section[aria-label="问答"] li > p, article[aria-label="当前最高票问题"] > p')) {
            if (p.textContent.startsWith('M6 页面反馈 ')) window.feedbackSeen[p.textContent] ??= Date.now()
          }
        }
        new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true })
        check()
      })
    }
    const feedback = { author: [], observer: [], screen: [] }
    for (let sample = 0; sample < browserSamples; sample++) {
      const label = 'M6 页面反馈 ' + (sample + 1)
      await author.getByLabel('你的问题', { exact: true }).fill(label)
      const started = await author.getByRole('button', { name: '提交问题', exact: true }).evaluate(button => {
        const started = Date.now()
        button.click()
        return started
      })
      await Promise.all([author, observer, page].map(target =>
        target.waitForFunction(label => window.feedbackSeen[label] !== undefined, label, { timeout: 8000 })))
      for (const [key, target] of [['author', author], ['observer', observer], ['screen', page]]) {
        feedback[key].push(await target.evaluate(label => window.feedbackSeen[label], label) - started)
      }
      const live = (await get('browser feedback answer lookup', '/api/screen', admin)).data
      await post('answer browser sample', '/api/discussion/admin', admin, {
        action: 'answer', id: live.questions.find(item => item.body === label).id, answered: true,
      })
    }
    browserFeedback = Object.fromEntries(Object.entries(feedback).map(([key, samples]) => [key, stats(samples)]))
    await post('end browser feedback QA', '/api/discussion/admin', admin, { action: 'end', roundId: feedbackRound.id })
    await Promise.all(clients.map(client => client.context().close()))

    const raffleAuthor = withRehearsal ? 1 : 0
    const raffleReader = raffleAuthor + 1
    const rafflePool = USERS - baseline.winners
    await post('raffle seed post', '/api/discussion', members[raffleAuthor], { action: 'post', section: qa.section, body: 'M6 加权样例' })
    const seed = (await get('raffle seed read', '/api/discussion', members[raffleReader])).data.items.find(item => item.body === 'M6 加权样例')
    await post('raffle seed reply', '/api/discussion', members[raffleReader], { action: 'reply', postId: seed.id, parentId: null, body: 'M6 加权回复' })
    const current = (await get('projection state', '/api/screen/admin', admin)).data
    await post('switch raffle', '/api/screen/admin', admin, { mode: 'raffle', revision: current.revision })
    await post('start raffle', '/api/raffle', admin, { action: 'start', weighted: true, requireParticipation: false, latestId: current.raffleRounds[0]?.id ?? 0 })
    await page.getByText('抽奖进行中 · ' + rafflePool + ' 位候选人', { exact: true }).waitFor()
    await page.getByText(withRehearsal ? /^恭喜 彩排观众/ : /^恭喜 M6 观众/).waitFor({ timeout: 12000 })
    const winning = (await get('winner projection', '/api/screen', admin)).data
    const nameIndex = Number(winning.lottery.winner.split(' ').at(-1)) - 1
    const inbox = (await get('winning member inbox', '/api/personal', members[nameIndex])).data
    onePrize = inbox.threads.filter(thread => thread.system && thread.body.includes('中奖')).length
    assert.equal(onePrize, 1)
    assert.equal(winning.candidates.length, rafflePool)
    const weightedName = withRehearsal ? '彩排观众 · 002' : 'M6 观众 1'
    assert.equal(winning.candidates.find(candidate => candidate.name === weightedName).weight, 3)
    const d1 = (await get('direct database reconciliation', '/__m6_d1_reconcile')).data
    assert.deepEqual(d1, {
      attendees: USERS, questions: baseline.questions + USERS + 1 + browserSamples,
      likes: baseline.likes + USERS, winners: baseline.winners + 1,
      prizeMessages: baseline.prizeMessages + 1, admissionOpen: 0,
    })
    reconciliation.database = d1
    const out = { environment: base, httpConnections: connections, handshakeBatch, commit: process.env.DAMS_M6_COMMIT || 'working-tree-candidate',
      runs, statusCounts, failures, browser5xx, projectionResults, browserFeedback, liveQa, baseline, reconciliation, raffle: { pool: rafflePool, winnerInboxNotifications: onePrize } }
    const d1Stats = (await get('database metrics', '/__m6_d1_stats')).data
    fs.writeFileSync(path.join(output, 'd1.json'), JSON.stringify(d1Stats, null, 2) + '\n')
    if (runs.qrEntry) assert.ok(runs.qrEntry.p95 <= 2000, 'QR entry p95 exceeded 2 seconds')
    assert.ok(runs.question.p95 <= 2000, 'Question p95 exceeded 2 seconds')
    if (runs.concurrentFeedRefresh) assert.ok(runs.concurrentFeedRefresh.p95 <= 2000, 'Concurrent feed refresh p95 exceeded 2 seconds')
    assert.ok(runs.reconnectFeed.p95 <= 2000, 'Reconnect feed p95 exceeded 2 seconds')
    assert.ok(projectionResults.max <= 2000, 'Projection exceeded 2 seconds')
    assert.equal(browser5xx, 0)
    assert.deepEqual(failures, [])
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(out, null, 2) + '\n')
    console.log(JSON.stringify(out))
  } catch (error) {
    const d1Stats = admin ? (await get('database metrics', '/__m6_d1_stats').catch(() => null))?.data : null
    if (d1Stats) fs.writeFileSync(path.join(output, 'd1.json'), JSON.stringify(d1Stats, null, 2) + '\n')
    const out = { error: error.message, handshakeBatch, runs, statusCounts, failures, browser5xx, projectionResults, browserFeedback, liveQa, reconciliation, onePrize }
    fs.writeFileSync(path.join(output, 'failed.json'), JSON.stringify(out, null, 2) + '\n')
    console.error(error.stack)
    process.exitCode = 1
  } finally {
    liveWatch?.stop()
    for (const socket of sockets) {
      expectedClose.add(socket)
      socket.terminate()
    }
    if (admin && openedGate) await request('final close isolated gate', '/api/activity', { cookie: admin, method: 'PATCH', json: { admissionOpen: false } }).catch(() => {})
    await browser.close()
    await dispatcher?.close()
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1 })
