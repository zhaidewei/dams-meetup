#!/usr/bin/env node
// 压测入口。模拟 N 个虚拟用户，每人完整生命周期：
//   1. HTTP: 密码门 → /feed 渲染（CF Workers + SSR + DB join）
//   2. Realtime: 订阅 posts/replies/likes/poll_votes/event_state（5 张表）
//   3. 混合行为：90% 读 / 10% 写，think time 5-30s
//
// 写操作直接打 Supabase service_role（等同 server action 落库），不通过 server
// action endpoint —— 因为 Next.js Server Action 调用需要 React function id 签名，
// 程序化触发不现实。此脚本测的是 DB + Realtime 容量上限，不是 server action 路由。
//
// 用法：
//   ./scripts/loadtest.sh                       本地 250 用户，5 分钟
//   ./scripts/loadtest.sh --users 50 --duration 60
//   ./scripts/loadtest.sh --target https://live.nl-dams.com --users 250  ← 需要二次确认
//
// 多进程 / 多机分流（推荐 ≤80 用户 / 进程，避免单 event-loop 拥塞）：
//   ./scripts/loadtest.sh --users 50 --out /tmp/s1.json &
//   ./scripts/loadtest.sh --users 50 --out /tmp/s2.json &
//   wait
//   node loadtest/aggregate.mjs /tmp/s*.json
// 不同进程的 PID 隔离 cleanup 前缀，互不干扰。
//
// 退出会自动 cleanup：删除 contact_handle LIKE 'LOADTEST-%' 的 users 与级联数据。

import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { writeFileSync } from 'node:fs'
import { createUser, runUserLifecycle } from './user.mjs'
import { Stats } from './stats.mjs'
import { cleanup } from './cleanup.mjs'

const { values: argv } = parseArgs({
  options: {
    users:    { type: 'string', default: '250' },
    duration: { type: 'string', default: '300' },     // seconds
    target:   { type: 'string', default: 'http://localhost:3000' },
    rampup:   { type: 'string', default: '60' },      // seconds to spawn all users
    'write-rate': { type: 'string', default: '0.1' }, // P(write) per action tick
    'no-cleanup': { type: 'boolean', default: false },
    'dry-run':    { type: 'boolean', default: false },
    out:          { type: 'string' },                 // path to write final stats JSON for aggregator
  },
})

const USERS    = Number(argv.users)
const DURATION = Number(argv.duration) * 1000
let   RAMPUP   = Number(argv.rampup) * 1000
const WRITE_P  = Number(argv['write-rate'])
const TARGET   = argv.target.replace(/\/$/, '')

// 防呆：rampup 比 duration 还长 → 用户 spawn 完测试就结束了，
// 而且 sleep(stopAt - now) 触发 Node 的 TimeoutNegativeWarning。
// 默认 rampup=60s + 短 duration（朋友首次 smoke test 5 用户 30 秒）必踩。
if (RAMPUP > DURATION * 0.8) {
  const clamped = Math.max(1000, Math.floor(DURATION * 0.5))
  console.warn(`[warn] rampup ${RAMPUP/1000}s 超过 duration ${DURATION/1000}s 的 80%，自动 clamp 到 ${clamped/1000}s`)
  RAMPUP = clamped
}

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SRV  = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD      = process.env.EVENT_PASSWORD

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_ANON, SUPABASE_SRV, PASSWORD })) {
  if (!v) { console.error(`missing env: ${k}`); process.exit(1) }
}

if (TARGET.includes('nl-dams.com') && !process.env.LOADTEST_PROD_OK) {
  console.error('refuse: target points to production. Set LOADTEST_PROD_OK=1 to confirm.')
  process.exit(2)
}

console.log('=== load test ===')
console.log(`target:     ${TARGET}`)
console.log(`users:      ${USERS}`)
console.log(`duration:   ${DURATION/1000}s`)
console.log(`rampup:     ${RAMPUP/1000}s`)
console.log(`write rate: ${WRITE_P}`)
console.log(`dry-run:    ${argv['dry-run']}`)
console.log('===================')

if (argv['dry-run']) { console.log('dry-run: exiting before spawn'); process.exit(0) }

const stats = new Stats()
const sessions = []
const cfg = { TARGET, SUPABASE_URL, SUPABASE_ANON, SUPABASE_SRV, PASSWORD, WRITE_P, stats }

const startedAt = Date.now()
const stopAt = startedAt + DURATION

// Spawn users staggered over RAMPUP
for (let i = 0; i < USERS; i++) {
  const handle = `LOADTEST-${process.pid}-${i}`
  const session = createUser(cfg, handle)
  sessions.push(session)
  runUserLifecycle(session, stopAt).catch(err => {
    stats.inc('user_crashed')
    if (stats.get('user_crashed') < 5) console.error(`user ${i} crashed:`, err.message)
  })
  // Even spread of cold-start across rampup window
  if (i < USERS - 1) await sleep(RAMPUP / USERS)
}

console.log(`[${elapsed()}s] all ${USERS} users spawned, holding until ${DURATION/1000}s elapsed`)

// Periodic stats dump
const reporter = setInterval(() => {
  console.log(`[${elapsed()}s] ${stats.summary()}`)
}, 5000)

// Wait for end of test
await sleep(stopAt - Date.now())
clearInterval(reporter)

console.log('\n=== shutdown: closing realtime + http ===')
await Promise.all(sessions.map(s => s.close()))

console.log('\n=== final stats ===')
console.log(stats.fullReport())

if (argv.out) {
  const samples = {}
  for (const [k, arr] of stats.samples.entries()) {
    const count = stats.sampleCount.get(k) ?? 0
    const n = Math.min(count, arr.length)
    samples[k] = Array.from(arr.subarray(0, n))
  }
  const json = {
    config: { users: USERS, duration_s: DURATION / 1000, target: TARGET, write_rate: WRITE_P, started_at: new Date(startedAt).toISOString(), pid: process.pid },
    counters: Object.fromEntries(stats.counters),
    samples,
  }
  writeFileSync(argv.out, JSON.stringify(json, null, 2))
  console.log(`wrote stats to ${argv.out}`)
}

if (!argv['no-cleanup']) {
  console.log('\n=== cleanup ===')
  const removed = await cleanup({ url: SUPABASE_URL, srv: SUPABASE_SRV, prefix: `LOADTEST-${process.pid}-` })
  console.log(`removed ${removed} test users (and cascaded posts/likes/replies/votes)`)
} else {
  console.log('\n--no-cleanup set: leaving LOADTEST-* rows in DB. Run with cleanup later.')
}

function elapsed() { return ((Date.now() - startedAt) / 1000).toFixed(0) }
