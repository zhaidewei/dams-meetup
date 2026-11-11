'use client'

import { useEffect, useState } from 'react'

type ActivityState = { admissionOpen: boolean; revision: number }

const activityUrl = '/api/activity'

export function ActivityControls() {
  const [state, setState] = useState<ActivityState | null>(null)
  const [connected, setConnected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function applyState(next: ActivityState) {
    setState((previous) => previous && previous.revision > next.revision ? previous : next)
  }

  useEffect(() => {
    let stopped = false
    let socket: WebSocket
    let retry: ReturnType<typeof setTimeout> | undefined

    async function readState() {
      try {
        const response = await fetch(activityUrl, { cache: 'no-store' })
        if (!response.ok) throw new Error('Activity state unavailable')
        const next: ActivityState = await response.json()
        if (!stopped) {
          applyState(next)
          setError('')
        }
      } catch {
        if (!stopped) setError('读取状态失败，请刷新页面或重新登录。')
      }
    }

    function connect() {
      const url = new URL(`${activityUrl}/updates`, window.location.href)
      url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(url)
      socket.onopen = () => {
        setConnected(true)
        void readState()
      }
      socket.onmessage = () => void readState()
      socket.onclose = () => {
        if (stopped) return
        setConnected(false)
        retry = setTimeout(connect, 1500)
      }
    }

    void readState()
    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      socket.close()
    }
  }, [])

  async function changeAdmission(admissionOpen: boolean) {
    setSaving(true)
    try {
      const response = await fetch(activityUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admissionOpen }),
      })
      if (!response.ok) throw new Error('Activity update failed')
      applyState(await response.json())
      setError('')
    } catch {
      setError('保存失败，请刷新确认当前状态。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <p role="status">
        {state ? `观众入口：${state.admissionOpen ? '开启' : '关闭'}（版本 ${state.revision}）` : '正在读取观众入口…'}
      </p>
      <p>{connected ? '实时已连接' : '正在连接实时更新…'}</p>
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3">
        <button disabled={!state || saving || state.admissionOpen}
          onClick={() => void changeAdmission(true)}
          className="min-h-11 rounded-full bg-sky-700 px-5 py-2 text-white disabled:opacity-40">
          开启观众入口
        </button>
        <button disabled={!state || saving || !state.admissionOpen}
          onClick={() => void changeAdmission(false)}
          className="rounded border border-zinc-500 px-4 py-2 disabled:opacity-40">
          关闭观众入口
        </button>
      </div>
    </div>
  )
}
