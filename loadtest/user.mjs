// Virtual user — owns its own cookie jar, anon Supabase client (for Realtime),
// and a service-role client (for direct DB writes simulating server actions).
//
// Lifecycle per tick:
//   1. Random think time 5-30s (Poisson-ish)
//   2. With probability WRITE_P: pick a write action; else GET /feed
//   3. Loop until stopAt

import { createClient } from '@supabase/supabase-js'
import { setTimeout as sleep } from 'node:timers/promises'

export function createUser(cfg, handle) {
  const cookies = new Map()
  const anon = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  const srv = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SRV, { auth: { persistSession: false } })

  return {
    cfg,
    handle,
    cookies,
    anon,
    srv,
    uid: null,
    channel: null,
    knownPostIds: [],   // Track recent post ids for likes/replies
    closed: false,
    async close() {
      this.closed = true
      if (this.channel) await this.anon.removeChannel(this.channel)
      await this.anon.realtime.disconnect()
    },
  }
}

export async function runUserLifecycle(s, stopAt) {
  // Step 1: HTTP password gate → /feed (provisions uid cookie via ensureUser)
  await passwordLogin(s)
  await visitFeed(s)
  // Step 2: subscribe Realtime (mirrors FeedRealtime)
  await subscribeRealtime(s)
  // Step 3: action loop
  while (!s.closed && Date.now() < stopAt) {
    await sleep(5000 + Math.random() * 25000)
    if (s.closed || Date.now() >= stopAt) break
    if (Math.random() < s.cfg.WRITE_P) {
      await pickWrite(s)
    } else {
      await visitFeed(s)
    }
  }
}

async function passwordLogin(s) {
  const t0 = Date.now()
  try {
    // POST / with form action — Next.js server action style. The page accepts
    // `password` and sets dams-pw-ok + dams-uid cookies.
    const body = new URLSearchParams({ password: s.cfg.PASSWORD, next: '/feed' })
    const res = await fetch(`${s.cfg.TARGET}/`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Next-Action': 'login',
      },
      body,
    })
    storeCookies(s, res)
    s.cfg.stats.observe('http_login_ms', Date.now() - t0)
    if (res.status >= 400) s.cfg.stats.inc('http_login_err')

    // Server action returns 303/307 to /feed but doesn't always set cookies on
    // the redirect response. We work around by directly inserting a user row
    // with service_role and synthesizing a uid cookie. This is the price of
    // not going through real React Server Actions, but exercises the same DB
    // state.
    if (!s.cookies.get('dams-uid')) {
      const { data, error } = await s.srv
        .from('users')
        .insert({ contact_handle: s.handle, nickname: s.handle.slice(0, 30) })
        .select('id')
        .single()
      if (error) throw error
      s.uid = data.id
      s.cookies.set('dams-uid', data.id)
      s.cookies.set('dams-pw-ok', '1')
    } else {
      s.uid = s.cookies.get('dams-uid')
      // Mark our row so cleanup can find it — NULL if uid was already a real user
      await s.srv.from('users').update({ contact_handle: s.handle }).eq('id', s.uid)
    }
  } catch (err) {
    s.cfg.stats.inc('http_login_err')
    throw err
  }
}

async function visitFeed(s) {
  const t0 = Date.now()
  let res
  try {
    res = await fetch(`${s.cfg.TARGET}/feed`, {
      headers: { Cookie: cookieHeader(s) },
      redirect: 'manual',
    })
    storeCookies(s, res)
    await res.text()  // drain
  } catch {
    s.cfg.stats.inc('http_feed_net')
    return
  }
  const ms = Date.now() - t0
  // Only count latency for actually-served responses; failures' "time to
  // failure" mixes in CF Workers / origin kill timing and would skew p50/p95
  // optimistically when error rate is high.
  if (res.status >= 500) {
    s.cfg.stats.inc('http_feed_5xx')
  } else if (res.status >= 400) {
    s.cfg.stats.inc('http_feed_4xx')
  } else {
    s.cfg.stats.observe('http_feed_ms', ms)
    s.cfg.stats.inc('http_feed_ok')
  }
}

async function subscribeRealtime(s) {
  return new Promise((resolve) => {
    const ch = s.anon
      .channel(`feed-changes-${s.handle}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' },       () => onBroadcast(s, 'posts'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replies' },     () => onBroadcast(s, 'replies'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' },       () => onBroadcast(s, 'likes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' },  () => onBroadcast(s, 'poll_votes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, () => onBroadcast(s, 'event_state'))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          s.cfg.stats.inc('realtime_subscribed')
          resolve()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          s.cfg.stats.inc('realtime_failed')
          resolve()
        }
      })
    s.channel = ch
  })
}

// Mirror FeedRealtime.tsx's DEBOUNCE_MS. Keep in sync — if the production
// debounce changes, this should too, otherwise the test exerts artificial
// load that doesn't match real browser behavior.
const RT_DEBOUNCE_MS = 2500
function onBroadcast(s, table) {
  s.cfg.stats.inc(`rt_${table}`)
  if (s._rtTimer) return
  s._rtTimer = setTimeout(() => {
    s._rtTimer = null
    if (!s.closed) visitFeed(s).catch(() => {})
  }, RT_DEBOUNCE_MS)
}

async function pickWrite(s) {
  const r = Math.random()
  if (r < 0.45)      await writePost(s)
  else if (r < 0.80) await writeLike(s)
  else if (r < 0.95) await writeReply(s)
  else               await writePost(s)  // fallback
}

async function writePost(s) {
  const t0 = Date.now()
  const body = `[loadtest] ${s.handle} ${Date.now()}`
  try {
    const { data, error } = await s.srv
      .from('posts')
      .insert({ user_id: s.uid, type: 'text', body, tags: ['loadtest'], section: 'lounge' })
      .select('id')
      .single()
    if (error) throw error
    s.knownPostIds.push(data.id)
    if (s.knownPostIds.length > 20) s.knownPostIds.shift()
    s.cfg.stats.observe('write_post_ms', Date.now() - t0)
    s.cfg.stats.inc('write_post')
  } catch (err) {
    s.cfg.stats.inc('write_post_err')
  }
}

async function writeLike(s) {
  const postId = await pickRandomPost(s)
  if (!postId) return
  const t0 = Date.now()
  try {
    const { error } = await s.srv.from('likes').upsert(
      { user_id: s.uid, post_id: postId },
      { onConflict: 'user_id,post_id', ignoreDuplicates: true },
    )
    if (error) throw error
    s.cfg.stats.observe('write_like_ms', Date.now() - t0)
    s.cfg.stats.inc('write_like')
  } catch (err) {
    s.cfg.stats.inc('write_like_err')
  }
}

async function writeReply(s) {
  const postId = await pickRandomPost(s)
  if (!postId) return
  const t0 = Date.now()
  try {
    const { error } = await s.srv
      .from('replies')
      .insert({ user_id: s.uid, post_id: postId, body: `[loadtest reply] ${Date.now()}` })
    if (error) throw error
    s.cfg.stats.observe('write_reply_ms', Date.now() - t0)
    s.cfg.stats.inc('write_reply')
  } catch (err) {
    s.cfg.stats.inc('write_reply_err')
  }
}

async function pickRandomPost(s) {
  if (s.knownPostIds.length > 0 && Math.random() < 0.7) {
    return s.knownPostIds[Math.floor(Math.random() * s.knownPostIds.length)]
  }
  // Fall back to fetching a recent post id (cheap query)
  const { data } = await s.srv.from('posts').select('id').order('created_at', { ascending: false }).limit(20)
  if (!data?.length) return null
  return data[Math.floor(Math.random() * data.length)].id
}

// --- HTTP cookie utilities ---
function storeCookies(s, res) {
  const setCookie = res.headers.getSetCookie?.() ?? []
  for (const sc of setCookie) {
    const [pair] = sc.split(';')
    const eq = pair.indexOf('=')
    if (eq > 0) s.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}

function cookieHeader(s) {
  return [...s.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
