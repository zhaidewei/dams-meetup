'use client'

import { useEffect, useState } from 'react'
import { AdmissionScreen } from '@/components/meetup15/AdmissionScreen'

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
    const refresh = setInterval(() => void readState(), 5000)
    return () => {
      stopped = true
      clearInterval(refresh)
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
    <section className="space-y-4 rounded-2xl border border-dams-line bg-white p-4 sm:p-5">
      <h1 className="text-xl font-semibold">观众入场</h1>
      <p role="status">
        {state ? `观众入口：${state.admissionOpen ? '开启' : '关闭'}` : '正在读取观众入口…'}
      </p>
      <p>{connected ? '实时已连接' : '正在连接实时更新…'}</p>
      {error && <p role="alert">{error}</p>}
      {state && !state.admissionOpen && (
        <p className="text-sm text-slate-600">首次开放前，请先在「管理彩排」清理测试数据。开放后，彩排清空和填充将停用。</p>
      )}
      <div className="flex flex-wrap gap-3">
        <button disabled={!state || saving || state.admissionOpen}
          onClick={() => void changeAdmission(true)}
          className="min-h-11 rounded-full bg-dams-blue px-5 py-2 text-white disabled:opacity-40">
          开启观众入口
        </button>
        <button disabled={!state || saving || !state.admissionOpen}
          onClick={() => void changeAdmission(false)}
          className="min-h-11 rounded border border-zinc-500 px-4 py-2 disabled:opacity-40">
          关闭观众入口
        </button>
      </div>
      {state?.admissionOpen && (
        <div className="rounded-xl border border-dams-selection bg-dams-wash p-4">
          <AdmissionScreen compact copyable />
        </div>
      )}
    </section>
  )
}
