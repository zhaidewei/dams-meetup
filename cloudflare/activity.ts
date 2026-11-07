/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from 'cloudflare:workers'
import { ADMIN_COOKIE_NAME, verifySessionCookie } from '../src/lib/session-cookie-crypto'

export interface ActivityEnv {
  ACTIVITY_DB: D1Database
  ACTIVITY_UPDATES: DurableObjectNamespace<ActivityUpdates>
  SESSION_SECRET?: string
}

type ActivityState = { admission_open: number; revision: number }

export class ActivityUpdates extends DurableObject<ActivityEnv> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response(null, { status: 426 })
    }

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  publish(): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send('activity.updated')
    }
  }

  webSocketMessage(socket: WebSocket): void {
    socket.close(1008, 'Read-only stream')
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason)
  }
}

export async function handleActivityRequest(request: Request, env: ActivityEnv): Promise<Response> {
  const url = new URL(request.url)
  const cookie = request.headers.get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.slice(ADMIN_COOKIE_NAME.length + 1)
  if (verifySessionCookie(ADMIN_COOKIE_NAME, cookie, env.SESSION_SECRET) !== '1') {
    return new Response(null, { status: 401 })
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
    { admissionOpen: state.admission_open === 1, revision: state.revision },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
