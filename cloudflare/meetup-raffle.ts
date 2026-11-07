import { randomInt } from 'node:crypto'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import { INTERACTION_END } from '../src/lib/meetup15/event'
import { requestCookie } from '../src/lib/meetup15/identity'
import { RAFFLE_ACTIVE_HOURS, type LotteryScreen } from '../src/lib/meetup15/raffle'
import type { ActivityEnv } from './activity'

const headers = { 'Cache-Control': 'private, no-store' }
const failure = (status: number, error: string) => Response.json({ error }, { status, headers })
const ANIMATION_MS = 5000
const ACTIVE_SECONDS = RAFFLE_ACTIVE_HOURS * 60 * 60

type Candidate = { id: string; name: string; weight: number }
type Draw = { id: number; readyAt: number; finishedAt: number | null; winner: string | null; candidateCount: number }

const DRAW_FIELDS = `id, ready_at AS readyAt, finished_at AS finishedAt, winner_name AS winner,
  json_array_length(candidates) AS candidateCount`

function drawResult(draw: Draw | null): LotteryScreen | null {
  if (!draw) return null
  if (draw.finishedAt === null) return { phase: 'drawing', readyAt: draw.readyAt, candidateCount: draw.candidateCount }
  return draw.winner ? { phase: 'winner', winner: draw.winner } : { phase: 'empty' }
}

export async function latestRaffle(db: D1Database) {
  const draw = await db.prepare(`
    SELECT ${DRAW_FIELDS} FROM meetup15_raffles ORDER BY id DESC LIMIT 1
  `).first<Draw>()
  const result = drawResult(draw)
  return { latestId: draw?.id ?? 0, result, refreshAt: result?.phase === 'drawing' ? result.readyAt : null }
}

export function readRaffleRounds(db: D1Database) {
  return db.prepare(`
    SELECT id, finished_at AS finishedAt, winner_name AS winner
    FROM meetup15_raffles WHERE finished_at IS NOT NULL ORDER BY id DESC
  `)
}

export async function readRaffleProjection(db: D1Database, raffleId?: number) {
  const query = `SELECT ${DRAW_FIELDS}, candidates, winner_id AS winnerId, weighted,
    require_participation AS requireParticipation FROM meetup15_raffles`
  const draw = await (raffleId === undefined
    ? db.prepare(`${query} ORDER BY id DESC LIMIT 1`)
    : db.prepare(`${query} WHERE id = ? AND finished_at IS NOT NULL`).bind(raffleId))
    .first<Draw & { candidates: string; winnerId: string | null; weighted: number | null; requireParticipation: number | null }>()
  if (!draw && raffleId !== undefined) return null
  const lottery = drawResult(draw)
  const pool: Candidate[] = draw ? JSON.parse(draw.candidates) : []
  const rules = draw && draw.weighted !== null && draw.requireParticipation !== null
    ? { weighted: Boolean(draw.weighted), requireParticipation: Boolean(draw.requireParticipation) }
    : null
  return {
    raffleId: draw?.id ?? null,
    lottery,
    refreshAt: lottery?.phase === 'drawing' ? lottery.readyAt : null,
    candidates: pool.map(({ id, name, weight }) => ({ name, weight, won: id === draw?.winnerId })),
    rules,
  }
}

function updates(env: ActivityEnv) {
  return env.ACTIVITY_UPDATES.getByName('meetup-15-discussion')
}

async function startDraw(env: ActivityEnv, latestId: number, weighted: boolean, requireParticipation: boolean, now: number) {
  const db = env.ACTIVITY_DB
  const cutoff = Math.floor(now / 1000) - ACTIVE_SECONDS
  const readyAt = now + ANIMATION_MS
  const draw = await db.prepare(`
      WITH participation AS (
        SELECT author_id, MAX(kind = 'post') AS wrote_post FROM meetup15_discussion
        WHERE kind IN ('post', 'reply') GROUP BY author_id
      ), received_replies AS (
        SELECT DISTINCT parent.author_id FROM meetup15_discussion r
        JOIN meetup15_discussion parent ON parent.id = COALESCE(r.parent_reply_id, r.post_id)
        WHERE r.kind = 'reply' AND r.author_id <> parent.author_id
      ), pool AS (
        SELECT m.id, COALESCE(m.display_name, '现场观众') AS name,
          1 + CASE WHEN ? THEN COALESCE(p.wrote_post, 0) + (r.author_id IS NOT NULL) ELSE 0 END AS weight
        FROM meetup15_members m
        LEFT JOIN participation p ON p.author_id = m.id
        LEFT JOIN received_replies r ON r.author_id = m.id
        WHERE m.role = 'attendee' AND m.last_seen_at >= ?
          AND (? = 0 OR p.author_id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM meetup15_raffles WHERE winner_id = m.id)
      ), snapshot AS (
        SELECT json_group_array(json_object('id', id, 'name', name, 'weight', weight)) AS candidates,
          COUNT(*) AS candidate_count FROM pool
      )
      INSERT INTO meetup15_raffles (candidates, ready_at, finished_at, weighted, require_participation)
      SELECT candidates, ?, CASE WHEN candidate_count = 0 THEN ? END, ?, ? FROM snapshot
      WHERE COALESCE((SELECT MAX(id) FROM meetup15_raffles), 0) = ?
        AND NOT EXISTS (SELECT 1 FROM meetup15_raffles WHERE finished_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM meetup15_summary WHERE cleaned_at IS NOT NULL)
        AND EXISTS (SELECT 1 FROM activity_state WHERE id = 1 AND projection_mode = 'raffle' AND projection_raffle_id IS NULL)
      RETURNING id, finished_at AS finishedAt
  `).bind(Number(weighted), cutoff, Number(requireParticipation), readyAt, now, Number(weighted), Number(requireParticipation), latestId)
    .first<{ id: number; finishedAt: number | null }>()
  if (!draw) return failure(409, '抽奖状态已变化，请核对后重试。')
  const screen = updates(env)
  await Promise.allSettled([
    screen.publish('screen.updated'),
    ...(draw.finishedAt === null ? [screen.scheduleRaffle(readyAt)] : []),
  ])
  return new Response(null, { status: 204, headers })
}

export async function finishPendingRaffle(env: ActivityEnv, now = Date.now()) {
  const db = env.ACTIVITY_DB
  const draw = await db.prepare(`
    SELECT id, candidates, ready_at AS readyAt FROM meetup15_raffles WHERE finished_at IS NULL
  `).first<{ id: number; candidates: string; readyAt: number }>()
  if (!draw) return null
  if (now < draw.readyAt) return draw.readyAt

  const pool = JSON.parse(draw.candidates) as Candidate[]
  let ticket = randomInt(pool.reduce((total, candidate) => total + candidate.weight, 0))
  const winner = pool.find((candidate) => (ticket -= candidate.weight) < 0)!
  const [result] = await db.batch([
    db.prepare(`
      UPDATE meetup15_raffles SET winner_id = ?, winner_name = ?, finished_at = ?
      WHERE id = ? AND finished_at IS NULL
    `).bind(winner.id, winner.name, now, draw.id),
    db.prepare(`
      INSERT OR IGNORE INTO meetup15_dm_threads (member_a, member_b)
      SELECT winner_id, NULL FROM meetup15_raffles WHERE id = ? AND winner_id IS NOT NULL
    `).bind(draw.id),
    db.prepare(`
      INSERT OR IGNORE INTO meetup15_dm_messages (thread_id, raffle_id, body)
      SELECT t.id, r.id, '恭喜你在第 15 期 Meetup 的现场抽奖中中奖！请联系现场工作人员领奖。'
      FROM meetup15_raffles r JOIN meetup15_dm_threads t ON t.member_a = r.winner_id AND t.member_b IS NULL
      WHERE r.id = ?
    `).bind(draw.id),
  ])
  if (result.meta.changes) {
    await env.ACTIVITY_UPDATES.getByName(`meetup-15-personal:${winner.id}`).publish().catch(() => {})
  }
  return null
}

export async function handleRaffle(request: Request, env: ActivityEnv, clock = Date.now) {
  const url = new URL(request.url)
  if (verifySessionCookie(ACTIVITY_ADMIN_COOKIE, requestCookie(request, ACTIVITY_ADMIN_COOKIE), env.SESSION_SECRET) !== '1') {
    return failure(401, '请重新登录后继续。')
  }
  if (request.method === 'GET') return Response.json(await latestRaffle(env.ACTIVITY_DB), { headers })
  if (request.method !== 'POST') return failure(405, '不支持此操作。')
  if (request.headers.get('Origin') !== url.origin) return failure(403, '来源不正确。')
  const input = await request.json<Record<string, unknown>>().catch(() => null)
  if (input?.action === 'finish') {
    await updates(env).resolveRaffle()
    return new Response(null, { status: 204, headers })
  }
  const now = clock()
  if (now >= INTERACTION_END) return failure(409, '本届互动区已关闭。')
  if (input?.action !== 'start' || typeof input.weighted !== 'boolean' ||
      typeof input.requireParticipation !== 'boolean' || typeof input.latestId !== 'number' ||
      !Number.isSafeInteger(input.latestId) || input.latestId < 0) {
    return failure(400, '请检查抽奖设置。')
  }
  return startDraw(env, input.latestId, input.weighted, input.requireParticipation, now)
}
