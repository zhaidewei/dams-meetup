'use client'

import { useEffect, useRef, useState } from 'react'
import type { MemberCommand, StaffCommand } from '@/lib/meetup15/discussion'

export function useDiscussion<T extends { refreshAt: number | null }, Command = MemberCommand | StaffCommand>(
  url: string, topic: 'discussion' | 'projection' = 'discussion',
) {
  const [view, setView] = useState<{ url: string; data: T | null; error: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const refresh = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const controller = new AbortController()
    let socket: WebSocket | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let queuedRead: ReturnType<typeof setTimeout> | undefined
    let boundary: ReturnType<typeof setTimeout> | undefined
    let reading: Promise<void> | undefined
    let readAgain = false

    function schedule() {
      if (queuedRead || controller.signal.aborted) return
      queuedRead = setTimeout(() => {
        queuedRead = undefined
        void read()
      }, 180)
    }

    async function fetchView() {
      try {
        const response = await fetch(url, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(7000)]),
        })
        if (controller.signal.aborted) return
        if (response.status === 401) {
          setView({ url, data: null, error: '登录已失效，请重新进入活动。' })
          return
        }
        if (!response.ok) throw new Error('Discussion read failed')
        const data = await response.json<T>()
        if (controller.signal.aborted) return
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
      const address = new URL('/api/discussion/updates', window.location.href)
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

    refresh.current = async () => {
      await reading
      if (!controller.signal.aborted) await read()
    }
    void read()
    connect()
    const fallback = setInterval(schedule, 15000)
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
  }, [url, topic])

  async function submit(command: Command) {
    setPending(true)
    setActionError('')
    try {
      const response = await fetch(url.split('?')[0], {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command), signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) {
        const result = await response.json<{ error?: string }>().catch(() => null)
        setActionError(result?.error ?? '操作失败，请刷新后重试。')
        await refresh.current()
        return false
      }
      await refresh.current()
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
    submit,
  }
}
