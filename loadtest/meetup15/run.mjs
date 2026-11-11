import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"
import { Agent } from "undici"
const connections = Number(process.env.DAMS_M6_CONNECTIONS) || 0
const dispatcher = connections ? new Agent({ connections, pipelining: 1 }) : undefined
import WebSocket from "ws"

const base = process.argv[3]
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/)
const output = process.argv[2]
const handshakeBatch = Number(process.env.DAMS_WS_BATCH ?? 25)
assert.ok(Number.isInteger(handshakeBatch) && handshakeBatch >= 1 && handshakeBatch <= 200)
const wsUrl = new URL('/api/discussion/updates', base)
wsUrl.protocol = 'ws:'
const USERS = 200
const indices = Array.from({ length: USERS }, (_, i) => i)
const runs = {}
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
async function request(stage, route, { cookie, method = 'GET', form, json, expect = 200 } = {}) {
  const start = performance.now()
  const headers = { Origin: base, 'X-M6-Stage': stage }
  if (cookie) headers.Cookie = cookie
  if (json) headers['Content-Type'] = 'application/json'
  try {
    const response = await fetch(base + route, { method, headers,
      body: json ? JSON.stringify(json) : form ? new URLSearchParams(form) : undefined,
      redirect: 'manual', dispatcher, signal: AbortSignal.timeout(15000) })
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text()
    const key = String(response.status)
    statusCounts[key] = (statusCounts[key] || 0) + 1
    if (response.status !== expect) failures.push({ stage, status: response.status, error: typeof data === 'object' ? data?.error : undefined })
    assert.equal(response.status, expect, stage)
    return { response, data, elapsed: performance.now() - start, ack: Date.now() }
  } catch (error) {
    if (error.code !== 'ERR_ASSERTION') failures.push({ stage, error: error.message, cause: error.cause?.code, detail: error.cause?.message })
    throw error
  }
}
const post = (stage, route, cookie, json, expect = 204) =>
  request(stage, route, { cookie, method: 'POST', json, expect })
const get = (stage, route, cookie) => request(stage, route, { cookie })
const cookieFrom = response => response.headers.getSetCookie()[0]?.split(';', 1)[0]
async function measure(stage, promises) {
  const results = await Promise.allSettled(promises)
  const fulfilled = results.filter(result => result.status === 'fulfilled').map(result => result.value)
  if (fulfilled.length) runs[stage] = stats(fulfilled.map(item => item.elapsed))
  assert.equal(fulfilled.length, results.length, stage)
  return fulfilled
}
function openSocket(cookie) {
  const start = performance.now()
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl, { headers: { Cookie: cookie, Origin: base, 'X-M6-Stage': 'memberWebSocket' }, handshakeTimeout: 12000 })
    const result = { socket, received: 0, elapsed: 0 }
    sockets.add(socket)
    socket.on('message', message => { if (message.toString() === 'activity.updated') result.received++ })
    socket.on('error', error => { failures.push({ stage: 'WebSocket', error: error.message, cause: error.cause?.code, detail: error.cause?.message }); reject(error) })
    socket.once('close', code => {
      sockets.delete(socket)
      if (!expectedClose.has(socket)) failures.push({ stage: 'WebSocket', error: 'Unexpected close', code })
    })
    socket.once('open', () => { result.elapsed = performance.now() - start; resolve(result) })
  })
}
async function connectMembers(stage, members) {
  const connected = []
  for (let offset = 0; offset < members.length; offset += handshakeBatch) {
    const batch = members.slice(offset, offset + handshakeBatch)
    connected.push(...await measure(stage + ' batch ' + (offset + 1), batch.map(openSocket)))
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
  let page
  let browser5xx = 0
  let projectionResults
  let reconciliation
  let onePrize
  try {
    const auth = await request('admin login', '/api/activity/session', { method: 'POST', form: { token: 'dams-local-admin' }, expect: 303 })
    admin = cookieFrom(auth.response)
    assert.ok(admin)
    assert.equal((await get('initial gate', '/api/activity', admin)).data.admissionOpen, false)
    const guest = await request('configure guest', '/api/meetup/guests', { cookie: admin, method: 'POST',
      form: { username: 'm6-fixture-guest', displayName: 'M6 测试嘉宾', password: 'm6-local-fixture-only' }, expect: 303 })
    assert.match(guest.response.headers.get('location'), /guest=saved/)
    const staff = (await get('qa admin', '/api/discussion/admin', admin)).data
    const guestId = staff.guests.find(row => row.name === 'M6 测试嘉宾').id
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
    const members = scans.map(item => cookieFrom(item.response))
    assert.equal(new Set(members).size, USERS)
    await request('close isolated gate', '/api/activity', { cookie: admin, method: 'PATCH', json: { admissionOpen: false } })
    await measure('nickname', members.map((cookie, i) => post('nickname', '/api/discussion', cookie,
      { action: 'nickname', name: 'M6 观众 ' + (i + 1) })))
    await measure('presence', members.map(cookie => post('presence', '/api/personal/presence', cookie)))
    await post('start QA', '/api/discussion/admin', admin, { action: 'start', guestId, activeRoundId: null, latestRoundId: null })
    const qa = (await get('active QA', '/api/discussion/admin', admin)).data.activeRound
    assert.ok(qa)
    await measure('initialFeed', members.map(cookie => get('initialFeed', '/api/discussion', cookie)))
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
        for (const row of document.querySelectorAll('section[aria-label="嘉宾问答"] li > p:first-child')) {
          const label = row.textContent
          if (!(label in window.m6SeenAt)) window.m6SeenAt[label] = at
        }
      }
      new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true })
      check()
    })
    assert.equal(sockets.size, USERS)
    const labels = indices.map(i => 'M6 问题 ' + String(i + 1).padStart(3, '0'))
    const questionPosts = measure('question', members.map((cookie, i) => post('question', '/api/discussion', cookie,
      { action: 'question', section: qa.section, roundId: qa.id, body: labels[i] })))
    const fanout = delay(180).then(() => measure('concurrentFeedRefresh', members.map(cookie => get('concurrentFeedRefresh', '/api/discussion', cookie))))
    const [posted] = await Promise.all([questionPosts, fanout])
    const questionView = (await get('question reconciliation', '/api/screen', admin)).data
    assert.equal(questionView.questions.length, USERS)
    const projectedLabels = questionView.questions.slice(0, 3).map(item => item.body)
    await page.waitForFunction(labels => {
      const shown = Array.from(document.querySelectorAll('section[aria-label="嘉宾问答"] li > p:first-child'), row => row.textContent)
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
    await page.getByText('100 个赞 · 未答', { exact: true }).waitFor()
    const top = await page.locator('section[aria-label="嘉宾问答"] li').first().textContent()
    assert.ok(top.includes(labels[0]))
    await Promise.all(initialSockets.map(disconnect))
    const offline = await post('question while offline', '/api/discussion', members[0],
      { action: 'question', section: qa.section, roundId: qa.id, body: 'M6 断线期间新增的问题' })
    runs.offlineProbeWrite = stats([offline.elapsed])
    await delay(3000)
    const reconnected = await connectMembers('reconnectWebSocket', members)
    const hydrated = await measure('reconnectFeed', members.map(cookie => get('reconnectFeed', '/api/discussion', cookie)))
    for (const snapshot of hydrated) {
      assert.equal(snapshot.data.questions.length, USERS + 1)
      assert.ok(snapshot.data.questions.some(item => item.body === 'M6 断线期间新增的问题'))
      for (const q of snapshot.data.questions) assert.equal(q.likes, expectedLikes.get(q.id) || 0)
    }
    await post('end QA', '/api/discussion/admin', admin, { action: 'end', roundId: qa.id })
    await page.waitForFunction(() => document.querySelector('main')?.textContent === '')
    await delay(100)
    assert.equal(sockets.size, USERS)
    const reconnectionDeliveries = reconnected.filter(entry => entry.received > 0).length
    assert.equal(reconnectionDeliveries, USERS)
    const historical = (await get('qa history', '/api/screen/preview?mode=qa&roundId=' + qa.id, admin)).data
    assert.equal(historical.questions.length, USERS + 1)
    await Promise.all(reconnected.map(disconnect))
    reconciliation = { uniqueSessions: new Set(members).size, initialWebSocketEventRecipients: firstDeliveries,
      questionBroadcastsPerMember: Math.max(...initialSockets.map(entry => entry.received)), questions: historical.questions.length, likes: historical.questions.reduce((sum, item) => sum + item.likes, 0),
      expectedTopQuestionLikes: 100, reconnectEventRecipients: reconnectionDeliveries,
      reconnectSnapshots: hydrated.length, reconnectMissing: 0 }

    await post('raffle seed post', '/api/discussion', members[0], { action: 'post', section: qa.section, body: 'M6 加权样例' })
    const seed = (await get('raffle seed read', '/api/discussion', members[1])).data.items.find(item => item.body === 'M6 加权样例')
    await post('raffle seed reply', '/api/discussion', members[1], { action: 'reply', postId: seed.id, parentId: null, body: 'M6 加权回复' })
    const current = (await get('projection state', '/api/screen/admin', admin)).data
    await post('switch raffle', '/api/screen/admin', admin, { mode: 'raffle', revision: current.revision })
    await post('start raffle', '/api/raffle', admin, { action: 'start', weighted: true, requireParticipation: false, latestId: 0 })
    await page.getByText('抽奖进行中 · 200 位候选人', { exact: true }).waitFor()
    await page.getByText(/^恭喜 M6 观众/).waitFor({ timeout: 12000 })
    const winning = (await get('winner projection', '/api/screen', admin)).data
    const nameIndex = Number(winning.lottery.winner.split(' ').at(-1)) - 1
    const inbox = (await get('winning member inbox', '/api/personal', members[nameIndex])).data
    onePrize = inbox.threads.filter(thread => thread.system && thread.body.includes('中奖')).length
    assert.equal(onePrize, 1)
    assert.equal(winning.candidates.length, USERS)
    assert.equal(winning.candidates.find(candidate => candidate.name === 'M6 观众 1').weight, 3)
    const d1 = (await get('direct database reconciliation', '/__m6_d1_reconcile')).data
    assert.deepEqual(d1, { attendees: 200, questions: 201, likes: 200, winners: 1, prizeMessages: 1, admissionOpen: 0 })
    reconciliation.database = d1
    const out = { environment: base, httpConnections: connections, handshakeBatch, commit: process.env.DAMS_M6_COMMIT || 'working-tree-candidate',
      runs, statusCounts, failures, browser5xx, projectionResults, reconciliation, raffle: { pool: USERS, winnerInboxNotifications: onePrize } }
    const d1Stats = (await get('database metrics', '/__m6_d1_stats')).data
    fs.writeFileSync(path.join(output, 'd1.json'), JSON.stringify(d1Stats, null, 2) + '\n')
    assert.ok(runs.qrEntry.p95 <= 2000, 'QR entry p95 exceeded 2 seconds')
    assert.ok(runs.question.p95 <= 2000, 'Question p95 exceeded 2 seconds')
    assert.ok(projectionResults.max <= 2000, 'Projection exceeded 2 seconds')
    assert.equal(browser5xx, 0)
    assert.deepEqual(failures, [])
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(out, null, 2) + '\n')
    console.log(JSON.stringify(out))
  } catch (error) {
    const d1Stats = admin ? (await get('database metrics', '/__m6_d1_stats').catch(() => null))?.data : null
    if (d1Stats) fs.writeFileSync(path.join(output, 'd1.json'), JSON.stringify(d1Stats, null, 2) + '\n')
    const out = { error: error.message, handshakeBatch, runs, statusCounts, failures, browser5xx, projectionResults, reconciliation, onePrize }
    fs.writeFileSync(path.join(output, 'failed.json'), JSON.stringify(out, null, 2) + '\n')
    console.error(error.stack)
    process.exitCode = 1
  } finally {
    for (const socket of sockets) {
      expectedClose.add(socket)
      socket.terminate()
    }
    if (admin) await request('final close isolated gate', '/api/activity', { cookie: admin, method: 'PATCH', json: { admissionOpen: false } }).catch(() => {})
    await browser.close()
    await dispatcher?.close()
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1 })
