'use client'

import { useEffect } from 'react'

export function useRaffleResolution(readyAt: number | null) {
  useEffect(() => {
    if (readyAt === null) return
    const controller = new AbortController()
    async function finish() {
      try {
        await fetch('/api/raffle', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finish' }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]) })
      } catch {
        // 断线恢复后，下一次重试会读取并公布同一轮结果。
      }
    }
    let retry: ReturnType<typeof setInterval> | undefined
    const timer = setTimeout(() => {
      void finish()
      retry = setInterval(() => void finish(), 3000)
    }, Math.max(0, readyAt - Date.now()))
    return () => {
      controller.abort()
      clearTimeout(timer)
      clearInterval(retry)
    }
  }, [readyAt])
}
