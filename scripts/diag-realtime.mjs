#!/usr/bin/env node
// Realtime 诊断：用 anon 订阅 public schema 所有表所有事件，
// 然后用 service role 在多张表上插一条测试数据，30 秒内看到的所有 broadcast
// 都打印出来。
//
// 目的：分辨"posts 不广播"是表特定问题，还是 Realtime 整体不通。
//
// 运行：
//   NEXT_PUBLIC_SUPABASE_URL="$(secret get supabase-dams-url)" \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY="$(secret get supabase-dams-anon)" \
//   SUPABASE_SERVICE_ROLE_KEY="$(secret get supabase-dams-srv)" \
//   node scripts/diag-realtime.mjs

import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SRV) {
  console.error('Missing env. Need URL / ANON / SERVICE_ROLE.')
  process.exit(2)
}

const RUN_MS = 30_000
const anon = createClient(URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const srv = createClient(URL, SRV, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let userId = null
let postId = null
const events = []

async function cleanup() {
  if (postId) {
    await srv.from('post_match_intents').delete().eq('post_id', postId)
    await srv.from('likes').delete().eq('post_id', postId)
    await srv.from('replies').delete().eq('post_id', postId)
    await srv.from('posts').delete().eq('id', postId)
  }
  if (userId) {
    await srv.from('users').delete().eq('id', userId)
  }
}

async function main() {
  const u = await srv
    .from('users')
    .insert({ nickname: 'diag-realtime' })
    .select('id')
    .single()
  if (u.error) {
    console.error('create user FAILED:', u.error)
    process.exit(1)
  }
  userId = u.data.id

  const channel = anon.channel('diag-realtime-channel')

  await new Promise((resolve, reject) => {
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' }, // ALL tables, ALL events
        (payload) => {
          const tag = `${payload.table}/${payload.eventType}`
          const cols = Object.keys(payload.new ?? payload.old ?? {})
          console.log(`[event] ${tag} cols=${JSON.stringify(cols)}`)
          events.push({ tag, cols })
        },
      )
      .subscribe((status, err) => {
        console.log(`[subscribe] status=${status}${err ? ' err=' + err.message : ''}`)
        if (status === 'SUBSCRIBED') resolve()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
          reject(new Error(`subscribe failed: ${status}`))
      })
  })

  // give the channel a moment to settle after SUBSCRIBED
  await new Promise((r) => setTimeout(r, 1000))

  console.log('Inserting test data into posts / likes / replies / poll_votes …')

  const p = await srv
    .from('posts')
    .insert({ user_id: userId, type: 'text', body: 'diag-test' })
    .select('id')
    .single()
  if (p.error) {
    console.error('insert post FAILED:', p.error.message)
  } else {
    postId = p.data.id
    console.log(`  posts insert ok, id=${postId}`)
  }

  if (postId) {
    const intentRes = await srv
      .from('post_match_intents')
      .insert({ post_id: postId, intent: 'diag-intent' })
    console.log('  post_match_intents insert', intentRes.error ? 'FAIL: ' + intentRes.error.message : 'ok (should NOT broadcast)')

    const likeRes = await srv.from('likes').insert({ user_id: userId, post_id: postId })
    console.log('  likes insert', likeRes.error ? 'FAIL: ' + likeRes.error.message : 'ok')

    const replyRes = await srv
      .from('replies')
      .insert({ post_id: postId, user_id: userId, body: 'diag-reply' })
    console.log('  replies insert', replyRes.error ? 'FAIL: ' + replyRes.error.message : 'ok')
  }

  console.log(`Listening for ${RUN_MS / 1000}s… any incoming broadcast will be logged above.`)
  await new Promise((r) => setTimeout(r, RUN_MS))

  console.log('--- summary ---')
  if (events.length === 0) {
    console.log('NO events received. Realtime is NOT delivering for this project at all.')
  } else {
    const byTable = events.reduce((acc, e) => {
      acc[e.tag] = (acc[e.tag] ?? 0) + 1
      return acc
    }, {})
    console.log('events by table/op:', byTable)
    const intentLeak = events.filter((e) => e.tag.startsWith('post_match_intents/'))
    if (intentLeak.length) {
      console.log('LEAK: post_match_intents broadcasts received:', intentLeak)
    } else {
      console.log('post_match_intents did NOT broadcast (good).')
    }
  }

  await cleanup()
  process.exit(events.length > 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('unexpected:', e)
  await cleanup()
  process.exit(1)
})
