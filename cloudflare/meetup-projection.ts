import { PROJECTION_MODES, type ProjectionAdminSnapshot,
  type ProjectionMode, type ProjectionSelection, type ProjectionView } from '../src/lib/meetup15/projection'
import { meetupAgendaAt, nextMeetupAgendaChange } from '../src/lib/meetup15/event'
import { requestCookie } from '../src/lib/meetup15/identity'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'
import type { ActivityEnv } from './activity'
import { readProjectionRound, readProjectionRounds } from './discussion-read'
import { readRaffleProjection, readRaffleRounds } from './meetup-raffle'

const headers = { 'Cache-Control': 'private, no-store' }

type StateRow = {
  mode: ProjectionMode
  roundId: number | null
  raffleId: number | null
  revision: number
}

function stateQuery(db: D1Database) {
  return db.prepare(`
    SELECT projection_mode AS mode, projection_round_id AS roundId, projection_raffle_id AS raffleId,
      projection_revision AS revision
    FROM activity_state WHERE id = 1`)
}

function selectionFrom(row: StateRow): ProjectionSelection {
  if (row.mode === 'qa') return row.roundId === null ? { mode: 'hidden' } : { mode: 'qa', roundId: row.roundId }
  if (row.mode === 'raffle') return { mode: 'raffle', raffleId: row.raffleId ?? undefined }
  return { mode: row.mode }
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function parseSelection(mode: unknown, roundId: unknown, raffleId: unknown): ProjectionSelection | null {
  if (typeof mode !== 'string' || !Object.hasOwn(PROJECTION_MODES, mode)) return null
  if (mode === 'qa') return positiveId(roundId) ? { mode, roundId } : null
  if (mode === 'raffle') {
    return raffleId === undefined || positiveId(raffleId) ? { mode, raffleId } : null
  }
  return { mode: mode as 'hidden' | 'opening' | 'agenda' }
}

async function readView(
  db: D1Database, selection: ProjectionSelection, now: number, revision?: number,
): Promise<ProjectionView | null> {
  switch (selection.mode) {
    case 'hidden': return { mode: 'hidden', refreshAt: null }
    case 'opening': return { mode: 'opening', refreshAt: null }
    case 'agenda': return {
      mode: 'agenda', currentStart: meetupAgendaAt(now)?.start ?? null, refreshAt: nextMeetupAgendaChange(now),
    }
    case 'qa': {
      const qa = await readProjectionRound(db, selection.roundId, revision)
      return qa ? { mode: 'qa', ...qa, refreshAt: null } : null
    }
    case 'raffle': {
      const raffle = await readRaffleProjection(db, selection.raffleId)
      return raffle ? { mode: 'raffle', ...raffle } : null
    }
  }
}

export async function handleProjection(request: Request, env: ActivityEnv, clock = Date.now) {
  const url = new URL(request.url)
  const admin = url.pathname === '/api/screen/admin'
  const preview = url.pathname === '/api/screen/preview'
  if (!admin && !preview && url.pathname !== '/api/screen') return new Response(null, { status: 404, headers })
  const cookie = requestCookie(request, ACTIVITY_ADMIN_COOKIE)
  if (verifySessionCookie(ACTIVITY_ADMIN_COOKIE, cookie, env.SESSION_SECRET) !== '1') {
    return Response.json({ error: '请重新登录后继续。' }, { status: 401, headers })
  }

  const db = env.ACTIVITY_DB
  if (request.method === 'GET') {
    if (admin) {
      const [state, rounds, raffleRounds] = await db.batch([stateQuery(db), readProjectionRounds(db), readRaffleRounds(db)])
      const row = state.results[0] as StateRow | undefined
      if (!row) return new Response(null, { status: 503, headers })
      return Response.json({
        selection: selectionFrom(row), revision: row.revision,
        rounds: rounds.results as unknown as ProjectionAdminSnapshot['rounds'],
        raffleRounds: raffleRounds.results as unknown as ProjectionAdminSnapshot['raffleRounds'], refreshAt: null,
      } satisfies ProjectionAdminSnapshot, { headers })
    }
    if (preview) {
      const raffleId = url.searchParams.get('raffleId')
      const selection = parseSelection(url.searchParams.get('mode'), Number(url.searchParams.get('roundId')),
        raffleId === null ? undefined : Number(raffleId))
      if (!selection) return new Response(null, { status: 400, headers })
      const row = await stateQuery(db).first<StateRow>()
      if (!row) return new Response(null, { status: 503, headers })
      const view = await readView(db, selection, clock())
      return view ? Response.json(view, { headers }) : new Response(null, { status: 404, headers })
    }

    // 问答内容与对应的大屏版本一起读取。问答开关改变时重读最新大屏状态。
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await stateQuery(db).first<StateRow>()
      if (!row) break
      const view = await readView(db, selectionFrom(row), clock(), row.revision)
      if (view) return Response.json(view, { headers })
    }
    return new Response(null, { status: 503, headers })
  }
  if (!admin || request.method !== 'POST') return new Response(null, { status: 405, headers })
  if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403, headers })
  const input = await request.json<{ mode?: unknown; roundId?: unknown; raffleId?: unknown; revision?: unknown }>().catch(() => null)
  const selection = parseSelection(input?.mode, input?.roundId, input?.raffleId)
  const revision = input?.revision
  if (!selection || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    return Response.json({ error: '请选择有效的大屏画面。' }, { status: 400, headers })
  }

  const roundId = selection.mode === 'qa' ? selection.roundId : null
  const raffleId = selection.mode === 'raffle' ? selection.raffleId ?? null : null
  const result = await db.prepare(`
    UPDATE activity_state
    SET projection_mode = ?, projection_round_id = ?, projection_raffle_id = ?, projection_revision = projection_revision + 1
    WHERE id = 1 AND projection_revision = ?
      AND (? IS NULL OR EXISTS (SELECT 1 FROM meetup15_qa_rounds WHERE id = ?))
      AND (? IS NULL OR EXISTS (SELECT 1 FROM meetup15_raffles WHERE id = ? AND finished_at IS NOT NULL))
  `).bind(selection.mode, roundId, raffleId, revision, roundId, roundId, raffleId, raffleId).run()
  if (!result.meta.changes) {
    return Response.json({ error: '大屏状态或问答轮次已变化，请核对后再确认。' }, { status: 409, headers })
  }
  try {
    await env.ACTIVITY_UPDATES.getByName('meetup-15-discussion').publish('screen.updated')
  } catch (error) {
    console.error('Projection update notification failed', error)
  }
  return new Response(null, { status: 204, headers })
}
