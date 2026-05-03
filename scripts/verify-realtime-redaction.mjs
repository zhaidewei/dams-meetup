#!/usr/bin/env node
// 验证 Realtime broadcast 不会泄漏 match_intent。
//
// 自 migration 0011 起，match_intent 已搬到独立表 post_match_intents（不进
// publication），posts 表整表广播。验证两件事：
//   A. anon 订阅 posts 能收到 INSERT broadcast（基本通路）
//   B. 收到的 payload 里没有 match_intent 字段（schema 决定 — posts 已无该列）
//   C. 同时做 post_match_intents 插入，anon 订阅 post_match_intents 收不到任何 broadcast
//
// 运行：
//   NEXT_PUBLIC_SUPABASE_URL="$(secret get supabase-dams-url)" \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY="$(secret get supabase-dams-anon)" \
//   SUPABASE_SERVICE_ROLE_KEY="$(secret get supabase-dams-srv)" \
//   node scripts/verify-realtime-redaction.mjs

import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !ANON || !SRV) {
  console.error(
    'Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.',
  )
  process.exit(2)
}

const TIMEOUT_MS = 15_000
const QUIET_WINDOW_MS = 5_000
const MARKER = `realtime-redaction-test-${Date.now()}`
const MATCH_INTENT_MARKER = `intent-marker-${Date.now()}`

const anon = createClient(URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const srv = createClient(URL, SRV, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let testPostId = null
let testUserId = null
let intentBroadcastSeen = false

async function cleanup() {
  if (testPostId) {
    await srv.from('post_match_intents').delete().eq('post_id', testPostId)
    await srv.from('posts').delete().eq('id', testPostId)
  }
  if (testUserId) {
    await srv.from('users').delete().eq('id', testUserId)
  }
}

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  cleanup().finally(() => process.exit(1))
}

function pass(msg) {
  console.log(`PASS: ${msg}`)
  cleanup().finally(() => process.exit(0))
}

async function main() {
  // create disposable user (posts.user_id is NOT NULL fk)
  const userIns = await srv
    .from('users')
    .insert({ nickname: 'realtime-test' })
    .select('id')
    .single()
  if (userIns.error) return fail(`create user: ${userIns.error.message}`)
  testUserId = userIns.data.id

  const channel = anon.channel('verify-realtime-redaction')

  const subscribed = new Promise((resolve, reject) => {
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          if (payload.new?.body !== MARKER) return // not ours
          const cols = Object.keys(payload.new ?? {})
          console.log('Got posts INSERT broadcast. columns:', cols)

          if ('match_intent' in (payload.new ?? {})) {
            return fail(
              `match_intent leaked in broadcast. value=${JSON.stringify(payload.new.match_intent)}`,
            )
          }
          const required = ['id', 'user_id', 'type', 'body', 'created_at']
          const missing = required.filter((c) => !cols.includes(c))
          if (missing.length) {
            return fail(`broadcast missing expected public columns: ${missing.join(', ')}`)
          }
          // posts broadcast looks clean — now wait QUIET_WINDOW_MS to confirm
          // post_match_intents stays silent.
          console.log(
            `posts payload clean. waiting ${QUIET_WINDOW_MS}ms to confirm post_match_intents is silent…`,
          )
          setTimeout(() => {
            if (intentBroadcastSeen) {
              fail('post_match_intents broadcast leaked to anon — table should NOT be in publication')
            } else {
              pass(
                'posts broadcast has no match_intent column AND post_match_intents is not broadcast to anon',
              )
            }
          }, QUIET_WINDOW_MS)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_match_intents' },
        (payload) => {
          if (payload.new?.post_id === testPostId || payload.old?.post_id === testPostId) {
            intentBroadcastSeen = true
            console.error('UNEXPECTED post_match_intents broadcast:', payload)
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
          reject(new Error(`subscribe status=${status} err=${err?.message ?? '-'}`))
      })
  })

  try {
    await Promise.race([
      subscribed,
      new Promise((_, rej) => setTimeout(() => rej(new Error('subscribe timeout')), 8000)),
    ])
  } catch (e) {
    return fail(`subscribe: ${e.message}`)
  }
  console.log('Subscribed. Inserting test post + intent…')

  const ins = await srv
    .from('posts')
    .insert({ user_id: testUserId, type: 'text', body: MARKER })
    .select('id')
    .single()
  if (ins.error) return fail(`insert post: ${ins.error.message}`)
  testPostId = ins.data.id

  const intIns = await srv
    .from('post_match_intents')
    .insert({ post_id: testPostId, intent: MATCH_INTENT_MARKER })
  if (intIns.error) return fail(`insert intent: ${intIns.error.message}`)

  setTimeout(() => fail('did not receive posts broadcast within timeout'), TIMEOUT_MS)
}

main().catch((e) => fail(`unexpected: ${e?.stack ?? e}`))
