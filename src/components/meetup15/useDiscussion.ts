'use client'

import { useEffect, useRef, useState } from 'react'
import type { MemberCommand, StaffCommand } from '@/lib/meetup15/discussion'

export type DiscussionTransport<T> = {
  headers(snapshot: T | null): Record<string, string>
  read(response: Response, snapshot: T | null): Promise<T>
  applyWrite(response: Response, snapshot: T): Promise<T | null>
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

  useEffect(() => {
    const controller = new AbortController()
    let socket: WebSocket | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let queuedRead: ReturnType<typeof setTimeout> | undefined
    let boundary: ReturnType<typeof setTimeout> | undefined
    let reading: Promise<void> | undefined
    let readAgain = false
    let snapshot: T | null = null
    let writeGeneration = 0

    function schedule() {
      if (queuedRead || controller.signal.aborted) return
      queuedRead = setTimeout(() => {
        queuedRead = undefined
        void read()
      }, 40)
    }

    async function fetchView() {
      const generation = writeGeneration
      try {
        const response = await fetch(url, {
          cache: 'no-store', headers: transport?.headers(snapshot), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]),
        })
        if (controller.signal.aborted) return
        if (response.status === 401) {
          snapshot = null
          setView({ url, data: null, unauthorized: true, error: '登录已失效，请重新进入活动。' })
          return
        }
        if (!response.ok) throw new Error('Discussion read failed')
        const data = transport ? await transport.read(response, snapshot) : await response.json<T>()
        if (controller.signal.aborted || generation !== writeGeneration) return
        snapshot = data
        setView({ url, data, error: '' })
        clearTimeout(boundary)
        const delay = data.refreshAt === null ? 0 : data.refreshAt - Date.now()
        if (delay > 0) boundary = setTimeout(schedule, delay)
      } catch {
        if (!controller.signal.aborted) setView((previous) => ({
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

    function connect() {
      const address = new URL(topic === 'personal' ? '/api/personal/updates' : '/api/discussion/updates', window.location.href)
      address.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(address)
      socket.onopen = schedule
      socket.onmessage = ({ data }) => {
        if (data === 'activity.updated' || (topic === 'projection' && data === 'screen.updated')) schedule()
      }
      socket.onclose = () => {
        if (!controller.signal.aborted) retry = setTimeout(connect, 3000)
      }
    }

    applyWrite.current = async response => {
      if (!transport || !snapshot || controller.signal.aborted) return false
      const current = snapshot
      const next = await transport.applyWrite(response, current)
      if (!next || controller.signal.aborted) return false
      // A read completed while the write body was decoded. Use the authoritative read path.
      if (snapshot !== current) return false
      snapshot = next
      writeGeneration++
      setView({ url, data: next, error: '' })
      schedule()
      return true
    }
    refresh.current = async () => {
      await reading
      if (!controller.signal.aborted) await read()
    }
    void read()
    if (topic !== 'stats') connect()
    const fallback = setInterval(schedule, topic === 'stats' ? 10000 : 15000)
    window.addEventListener('online', schedule)
    return () => {
      controller.abort()
      socket?.close()
      clearTimeout(retry)
      clearTimeout(queuedRead)
      clearTimeout(boundary)
      clearInterval(fallback)
      window.removeEventListener('online', schedule)
    }
  }, [url, topic, transport])

  async function submit(command: Command) {
    const apply = applyWrite.current
    setPending(true)
    setActionError('')
    try {
      const response = await fetch(topic === 'personal' ? url : url.split('?')[0], {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...transport?.headers(null) },
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
