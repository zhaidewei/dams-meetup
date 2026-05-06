#!/usr/bin/env node
// Seed realistic baseline content so loadtest measures the right thing.
// Empty-table tests give misleading IN-list optimization wins because the
// "full table" is also small. Real mid-event state has hundreds of posts and
// thousands of likes — that's what the optimizer needs to face.
//
// All seeded rows are tagged via users.contact_handle = 'SEED-<pid>-*' so
// they can be removed cleanly. Idempotent against existing test data: only
// touches rows it created.
//
// Usage:
//   ./scripts/seed.sh                                  # default: 200 users, 400 posts, 1500 likes, 500 replies
//   ./scripts/seed.sh --users 200 --posts 400
//   ./scripts/seed.sh --cleanup                        # remove all SEED-* rows
//
// Numbers chosen for ~mid-event state of a 200-attendee meetup:
//   200 active users × ~2 posts each = 400
//   200 × ~7 likes given = 1500
//   200 × ~2.5 replies given = 500
// Adjust if your forecast differs.

import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const { values: argv } = parseArgs({
  options: {
    users:    { type: 'string', default: '200' },
    posts:    { type: 'string', default: '400' },
    likes:    { type: 'string', default: '1500' },
    replies:  { type: 'string', default: '500' },
    cleanup:  { type: 'boolean', default: false },
  },
})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SRV) {
  console.error('missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SRV, { auth: { persistSession: false } })

if (argv.cleanup) {
  const { data, error } = await sb.from('users').select('id').like('contact_handle', 'SEED-%')
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  console.log(`found ${data?.length ?? 0} seed users`)
  if (!data?.length) process.exit(0)
  let removed = 0
  for (let i = 0; i < data.length; i += 100) {
    const ids = data.slice(i, i + 100).map(r => r.id)
    const { error: e } = await sb.from('users').delete().in('id', ids)
    if (e) { console.error('delete err:', e.message); break }
    removed += ids.length
    process.stdout.write(`\rcleaned ${removed}/${data.length}`)
  }
  console.log('\ndone')
  process.exit(0)
}

const N_USERS   = Number(argv.users)
const N_POSTS   = Number(argv.posts)
const N_LIKES   = Number(argv.likes)
const N_REPLIES = Number(argv.replies)

console.log(`seeding ${N_USERS} users, ${N_POSTS} posts, ${N_LIKES} likes, ${N_REPLIES} replies (pid ${process.pid})`)

const NOW = Date.now()
const EVENT_START = Date.parse(process.env.NEXT_PUBLIC_EVENT_START ?? '2026-05-09T12:45:00+02:00')
const EVENT_END   = Date.parse(process.env.NEXT_PUBLIC_EVENT_END   ?? '2026-05-09T18:00:00+02:00')

// Distribute across event window when relevant; otherwise within last 3h.
function pickTs() {
  const min = EVENT_START
  const max = Math.min(EVENT_END, NOW)
  if (Number.isFinite(min) && max > min) return new Date(min + Math.random() * (max - min)).toISOString()
  return new Date(NOW - Math.random() * 3 * 3600 * 1000).toISOString()
}

const SECTIONS = ['lounge', 'p1', 'p2', 'breakout', 'panel']
const TAGS_POOL = ['求职', '内推', '组队', '观点', '求助', 'AI', '数据', 'Q&A', 'ML', 'LLM']
const PHRASES = [
  '正在找数据工程师机会，欢迎私信',
  '求 ML 平台经验交流，下半场可以聊聊吗',
  '对 LangGraph 很感兴趣，有没有一起搞的',
  '荷兰华人圈想认识更多技术朋友',
  '公司在招 senior data engineer，base Eindhoven',
  '关于这个话题大家怎么看？欢迎讨论',
  '今天的分享很有启发，特别是关于 retrieval 的部分',
  '组个 RAG 实战 hackathon 队伍，有兴趣的留言',
]

// 1) Users
const userRows = []
for (let i = 0; i < N_USERS; i++) {
  userRows.push({
    contact_handle: `SEED-${process.pid}-u${i}`,
    nickname: `seed_user_${i}`,
    company: i % 5 === 0 ? `Company ${i}` : null,
  })
}
const userIds = []
for (let i = 0; i < userRows.length; i += 100) {
  const { data, error } = await sb.from('users').insert(userRows.slice(i, i + 100)).select('id')
  if (error) { console.error('user insert err:', error.message); process.exit(1) }
  for (const r of data) userIds.push(r.id)
  process.stdout.write(`\rusers ${userIds.length}/${N_USERS}`)
}
console.log()

// 2) Posts
const postRows = []
for (let i = 0; i < N_POSTS; i++) {
  const tags = pickN(TAGS_POOL, 1 + Math.floor(Math.random() * 3))
  postRows.push({
    user_id: userIds[Math.floor(Math.random() * userIds.length)],
    type: 'text',
    body: `[seed ${i}] ${PHRASES[Math.floor(Math.random() * PHRASES.length)]}`,
    tags,
    show_contact: Math.random() < 0.3,
    section: SECTIONS[Math.floor(Math.random() * SECTIONS.length)],
    created_at: pickTs(),
  })
}
const postIds = []
for (let i = 0; i < postRows.length; i += 100) {
  const { data, error } = await sb.from('posts').insert(postRows.slice(i, i + 100)).select('id')
  if (error) { console.error('post insert err:', error.message); process.exit(1) }
  for (const r of data) postIds.push(r.id)
  process.stdout.write(`\rposts ${postIds.length}/${N_POSTS}`)
}
console.log()

// 3) Likes (deduped on (user, post))
const likeKeys = new Set()
const likeRows = []
let attempts = 0
while (likeRows.length < N_LIKES && attempts < N_LIKES * 5) {
  const u = userIds[Math.floor(Math.random() * userIds.length)]
  const p = postIds[Math.floor(Math.random() * postIds.length)]
  const k = `${u}|${p}`
  attempts++
  if (likeKeys.has(k)) continue
  likeKeys.add(k)
  likeRows.push({ user_id: u, post_id: p })
}
let likesDone = 0
for (let i = 0; i < likeRows.length; i += 200) {
  const batch = likeRows.slice(i, i + 200)
  const { error } = await sb.from('likes').insert(batch)
  if (error) { console.error('like err:', error.message); break }
  likesDone += batch.length
  process.stdout.write(`\rlikes ${likesDone}/${likeRows.length}`)
}
console.log()

// 4) Replies
const replyRows = []
for (let i = 0; i < N_REPLIES; i++) {
  replyRows.push({
    user_id: userIds[Math.floor(Math.random() * userIds.length)],
    post_id: postIds[Math.floor(Math.random() * postIds.length)],
    body: `[seed reply ${i}] ${PHRASES[Math.floor(Math.random() * PHRASES.length)]}`,
    created_at: pickTs(),
  })
}
let repliesDone = 0
for (let i = 0; i < replyRows.length; i += 100) {
  const batch = replyRows.slice(i, i + 100)
  const { error } = await sb.from('replies').insert(batch)
  if (error) { console.error('reply err:', error.message); break }
  repliesDone += batch.length
  process.stdout.write(`\rreplies ${repliesDone}/${replyRows.length}`)
}
console.log('\nseed done. To remove: ./scripts/seed.sh --cleanup')

function pickN(arr, n) {
  const copy = [...arr].sort(() => Math.random() - 0.5)
  return copy.slice(0, n)
}
