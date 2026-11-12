/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from 'cloudflare:workers'
import { loadSharedQuestions, questionChanges, questionForViewer } from './discussion-read'
import type { QaPush } from '../src/lib/meetup15/discussion'
import { ADMISSION_END, meetupNow } from '../src/lib/meetup15/event'
import type { MeetupEnv } from '../src/lib/meetup15/identity'
import { readLiveStats } from './activity-stats'
import { loginActivityAdmin } from './activity-session'
import { finishPendingRaffle } from './meetup-raffle'
import { ACTIVITY_ADMIN_COOKIE, verifySessionCookie } from '../src/lib/session-cookie-crypto'

export interface ActivityEnv extends MeetupEnv {
  ACTIVITY_UPDATES: DurableObjectNamespace<ActivityUpdates>
  ADMIN_TOKEN?: string
  ACTIVITY_LOGIN_LIMIT: RateLimit
  ACTIVITY_ENTRY_LIMIT: RateLimit
}

type QaSession = { viewer: string; expiresAt: number }
type DiscussionUpdate = 'qa' | 'all'
type ActivityState = { admission_open: number; revision: number }

export class ActivityUpdates extends DurableObject<ActivityEnv> {
  private discussionUpdateQueued = false
  private pendingDiscussionUpdate: DiscussionUpdate | null = null
  private qaSnapshot: Awaited<ReturnType<typeof loadSharedQuestions>> = null

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response(null, { status: 426 })
    }

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    const session = request.headers.get('X-DAMS-QA-Session')
    if (session && new URL(request.url).pathname === '/api/discussion/updates') server.serializeAttachment(JSON.parse(session))
    return new Response(null, { status: 101, webSocket: client })
  }

  publish(event: 'activity.updated' | 'screen.updated' = 'activity.updated'): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(event)
    }
  }

  resetRehearsalConnections(): void {
    this.qaSnapshot = null
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue
      socket.serializeAttachment(null)
      socket.send('activity.updated')
      socket.close(1001, 'Activity reset')
    }
  }

  queueDiscussionUpdate(update: DiscussionUpdate = 'all'): void {
    if (this.pendingDiscussionUpdate !== 'all') this.pendingDiscussionUpdate = update
    if (this.discussionUpdateQueued) return
    this.discussionUpdateQueued = true
    this.ctx.waitUntil(this.flushDiscussionUpdates())
  }

  private async flushDiscussionUpdates() {
    try {
      while (this.pendingDiscussionUpdate) {
        await new Promise<void>(resolve => setTimeout(resolve, 80))
        const update = this.pendingDiscussionUpdate
        this.pendingDiscussionUpdate = null
        if (update === 'all') {
          this.qaSnapshot = null
          this.publish()
        } else {
          await this.publishQuestions()
        }
      }
    } catch (error) {
      console.error('Discussion update notification failed', error)
      this.qaSnapshot = null
      this.publish()
    } finally {
      this.discussionUpdateQueued = false
      if (this.pendingDiscussionUpdate) this.queueDiscussionUpdate(this.pendingDiscussionUpdate)
    }
  }

  private async publishQuestions() {
    const sockets = this.ctx.getWebSockets()
    const hasQaSubscribers = sockets.some(socket =>
      socket.readyState === WebSocket.OPEN && socket.deserializeAttachment())
    const next = hasQaSubscribers ? await loadSharedQuestions(this.env.ACTIVITY_DB, null) : null
    const before = next && this.qaSnapshot?.roundId === next.roundId ? this.qaSnapshot : null
    this.qaSnapshot = next

    for (const socket of hasQaSubscribers ? this.ctx.getWebSockets() : sockets) {
      if (socket.readyState !== WebSocket.OPEN) continue
      const session = socket.deserializeAttachment() as QaSession | null
      if (!session) {
        socket.send('activity.updated')
        continue
      }
      const { viewer, expiresAt } = session
      if (expiresAt <= (viewer ? meetupNow(this.env) : Date.now())) {
        socket.close(1008, 'Session expired')
        continue
      }
      if (!next) {
        socket.send('activity.updated')
        continue
      }
      if (before?.revision === next.revision) continue
      const delta = before ? questionChanges(before.questions, next.questions, viewer)
        : { upsert: next.questions.map(question => questionForViewer(question, viewer)), remove: [] }
      const payload: QaPush = { type: 'qa.updated', section: next.section, roundId: next.roundId,
        revision: next.revision, baseRevision: before?.revision ?? null, ...delta }
      const json = JSON.stringify(payload)
      socket.send(json.length <= 128_000 ? json : 'activity.updated')
    }
  }

  async scheduleRaffle(readyAt: number): Promise<void> {
    const alarm = await this.ctx.storage.getAlarm()
    if (alarm === null || readyAt < alarm) await this.ctx.storage.setAlarm(readyAt)
  }

  async resolveRaffle(): Promise<void> {
    const readyAt = await finishPendingRaffle(this.env)
    if (readyAt !== null) await this.scheduleRaffle(readyAt)
    else this.publish('screen.updated')
  }

  async alarm(): Promise<void> {
    await this.resolveRaffle()
  }

  webSocketMessage(socket: WebSocket): void {
    socket.close(1008, 'Read-only stream')
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    if (code === 1005 || code === 1006 || code === 1015) {
      socket.close()
      return
    }
    socket.close(code, reason)
  }
}

export async function handleActivityRequest(request: Request, env: ActivityEnv, now = Date.now()): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/api/activity/session') return loginActivityAdmin(request, env)

  const cookie = request.headers.get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACTIVITY_ADMIN_COOKIE}=`))
    ?.slice(ACTIVITY_ADMIN_COOKIE.length + 1)
  if (verifySessionCookie(ACTIVITY_ADMIN_COOKIE, cookie, env.SESSION_SECRET) !== '1') {
    return new Response(null, { status: 401 })
  }

  if (url.pathname === '/api/activity/stats') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } })
    return Response.json(await readLiveStats(env.ACTIVITY_DB, now), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  if (url.pathname === '/api/activity/updates') {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 })
    return env.ACTIVITY_UPDATES.getByName('meetup-15').fetch(request)
  }

  let updated: ActivityState | null = null
  if (request.method === 'PATCH') {
    if (request.headers.get('Origin') !== url.origin) return new Response(null, { status: 403 })
    const body = await request.json<{ admissionOpen?: unknown }>().catch(() => null)
    if (typeof body?.admissionOpen !== 'boolean') return new Response(null, { status: 400 })

    if (body.admissionOpen && now >= ADMISSION_END) return new Response(null, { status: 409 })
    const open = Number(body.admissionOpen)
    updated = await env.ACTIVITY_DB.prepare(
      `UPDATE activity_state SET admission_open = ?, revision = revision + 1
       WHERE id = 1 AND admission_open <> ?
       RETURNING admission_open, revision`,
    ).bind(open, open).first<ActivityState>()
  } else if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, PATCH' } })
  }

  const state = updated ?? await env.ACTIVITY_DB.prepare(
    'SELECT admission_open, revision FROM activity_state WHERE id = 1',
  ).first<ActivityState>()
  if (!state) return new Response(null, { status: 503 })

  if (updated) {
    try {
      await env.ACTIVITY_UPDATES.getByName('meetup-15').publish()
    } catch (error) {
      // D1 已提交。重连后由客户端读取最新状态。
      console.error('Activity update notification failed', error)
    }
  }

  return Response.json(
    { admissionOpen: state.admission_open === 1 && now < ADMISSION_END, revision: state.revision },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
