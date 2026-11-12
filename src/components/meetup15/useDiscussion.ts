'use client'

import { useEffect, useRef, useState } from 'react'
import type { MemberCommand, QaPush, StaffCommand } from '@/lib/meetup15/discussion'

export type DiscussionTransport<T> = {
  skipPollingWhenConnected?: boolean
  headers?(snapshot: T | null): Record<string, string>
  read?(response: Response, snapshot: T | null): Promise<T>
  applyWrite?(response: Response, snapshot: T): Promise<T | null>
  onQaPush?(push: QaPush, snapshot: T): T | null | undefined
}

export function useDiscussion<T extends { refreshAt: number | null }, Command = MemberCommand | StaffCommand>(
  url: string, topic: 'discussion' | 'projection' | 'personal' | 'stats' = 'discussion',
  transport?: DiscussionTransport<T>,
) {
  const [view, setView] = useState<{ url: string; data: T | null; error: string; unauthorized?: boolean } | null>(null)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const applyWrite = useRef<(response: Response) => Promise<boolean>>(async () => false)
  const refresh = useRef<() => Promise<void>>(async () => {})
  const connected = useRef(false)
  const notify = useRef<(data?: unknown) => void>(() => {})
  const skipPollingWhenConnected = transport?.skipPollingWhenConnected === true
  const receiveQuestions = Boolean(transport?.onQaPush)

  useEffect(() => {
    const controller = new AbortController()
    let queuedRead: ReturnType<typeof setTimeout> | undefined
    let boundary: ReturnType<typeof setTimeout> | undefined
    let reading: Promise<void> | undefined
    let readAgain = false
    let needsSnapshot = false
    let snapshot: T | null = null
    let writeGeneration = 0
    let retriedBoundary: number | null = null

    function schedule() {
      if (queuedRead || controller.signal.aborted) return
      queuedRead = setTimeout(() => {
        queuedRead = undefined
        void read()
      }, 40)
    }

    function resync() {
      needsSnapshot = true
      schedule()
    }

    async function fetchView() {
      const generation = writeGeneration
      try {
        const response = await fetch(url, {
          cache: 'no-store', headers: transport?.headers?.(snapshot), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]),
        })
        if (controller.signal.aborted) return
        if (response.status === 401) {
          snapshot = null
          needsSnapshot = false
          setView({ url, data: null, unauthorized: true, error: '登录已失效，请重新进入活动。' })
          return
        }
        if (!response.ok) throw new Error('Discussion read failed')
        const data = transport?.read ? await transport.read(response, snapshot) : await response.json<T>()
        if (controller.signal.aborted || generation !== writeGeneration) return
        snapshot = data
        needsSnapshot = false
        setView({ url, data, error: '' })
        clearTimeout(boundary)
        const delay = data.refreshAt === null ? 0 : data.refreshAt - Date.now()
        if (delay > 0) boundary = setTimeout(schedule, delay)
        else if (skipPollingWhenConnected && data.refreshAt !== null && data.refreshAt !== retriedBoundary) {
          // A read started just before the agenda changed can finish after the boundary.
          retriedBoundary = data.refreshAt
          boundary = setTimeout(schedule, 1000)
        }
      } catch {
        if (controller.signal.aborted) return
        needsSnapshot = true
        setView((previous) => ({
          url, data: previous?.url === url ? previous.data : null, error: '暂时无法刷新，请检查网络。',
        }))
      }
    }

    function read() {
      if (reading) {
        readAgain = true
        return reading
      }
      reading = fetchView().finally(() => {
        reading = undefined
        if (readAgain) {
          readAgain = false
          schedule()
        }
      })
      return reading
    }

    notify.current = (data) => {
      if (controller.signal.aborted) return
      if (data === undefined || data === 'activity.updated' || (topic === 'projection' && data === 'screen.updated')) {
        resync()
        return
      }
      if (!transport?.onQaPush || typeof data !== 'string' || !data.startsWith('{')) return
      try {
        const push = JSON.parse(data) as QaPush
        if (push.type !== 'qa.updated') return
        if (needsSnapshot) return schedule()
        const next = snapshot ? transport.onQaPush(push, snapshot) : null
        if (next === null) resync()
        if (next) {
          snapshot = next
          writeGeneration++
          setView({ url, data: next, error: '' })
          if (reading) readAgain = true
        }
      } catch {
        resync()
      }
    }

    applyWrite.current = async response => {
      if (!transport?.applyWrite || !snapshot || controller.signal.aborted) return false
      const current = snapshot
      const next = await transport.applyWrite(response, current)
      if (!next || controller.signal.aborted) return false
      // A read completed while the write body was decoded. Use the authoritative read path.
      if (snapshot !== current) return false
      if (next === current) return true
      snapshot = next
      writeGeneration++
      if (reading) readAgain = true
      setView({ url, data: next, error: '' })
      if (!transport.onQaPush || !connected.current) schedule()
      return true
    }
    refresh.current = async () => {
      await reading
      if (!controller.signal.aborted) await read()
    }
    function refreshOnForeground() {
      if (document.visibilityState === 'visible') resync()
    }

    void read()
    const fallback = setInterval(() => {
      if (!skipPollingWhenConnected || !connected.current || needsSnapshot) schedule()
    }, topic === 'stats' ? 10000 : 15000)
    window.addEventListener('online', resync)
    if (skipPollingWhenConnected) document.addEventListener('visibilitychange', refreshOnForeground)
    return () => {
      controller.abort()
      clearTimeout(queuedRead)
      clearTimeout(boundary)
      clearInterval(fallback)
      window.removeEventListener('online', resync)
      if (skipPollingWhenConnected) document.removeEventListener('visibilitychange', refreshOnForeground)
    }
  }, [url, topic, transport, skipPollingWhenConnected])

  useEffect(() => {
    if (topic === 'stats') return
    let stopped = false
    let socket: WebSocket
    let retry: ReturnType<typeof setTimeout> | undefined
    const address = new URL(topic === 'personal' ? '/api/personal/updates' : '/api/discussion/updates', window.location.href)
    address.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    if (receiveQuestions) address.searchParams.set('qa', topic === 'projection' ? 'projection' : 'member')

    function connect() {
      socket = new WebSocket(address)
      socket.onopen = () => {
        if (stopped) return
        connected.current = true
        notify.current()
      }
      socket.onmessage = ({ data }) => {
        if (!stopped) notify.current(data)
      }
      socket.onclose = () => {
        if (stopped) return
        connected.current = false
        retry = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      stopped = true
      connected.current = false
      clearTimeout(retry)
      socket.close()
    }
  }, [topic, receiveQuestions])

  async function submit(command: Command) {
    const apply = applyWrite.current
    setPending(true)
    setActionError('')
    try {
      const response = await fetch(topic === 'personal' ? url : url.split('?')[0], {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...transport?.headers?.(null) },
        body: JSON.stringify(command), signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) {
        const result = await response.json<{ error?: string }>().catch(() => null)
        setActionError(result?.error ?? '操作失败，请刷新后重试。')
        await refresh.current()
        return false
      }
      if (!await apply(response)) await refresh.current()
      return true
    } catch {
      setActionError('网络异常，请刷新确认操作结果。')
      await refresh.current()
      return false
    } finally {
      setPending(false)
    }
  }

  return {
    data: view?.url === url ? view.data : null,
    error: actionError || (view?.url === url ? view.error : ''),
    pending,
    unauthorized: view?.url === url && view.unauthorized === true,
    retry: () => {
      setActionError('')
      return refresh.current()
    },
    submit,
  }
}
