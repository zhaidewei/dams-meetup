'use client'

import { useEffect } from 'react'

export function MeetupPresence() {
  useEffect(() => {
    const controller = new AbortController()
    const touch = () => {
      if (document.visibilityState === 'visible') {
        void fetch('/api/personal/presence', { method: 'POST', signal: controller.signal }).catch(() => {})
      }
    }
    touch()
    document.addEventListener('visibilitychange', touch)
    const timer = setInterval(touch, 120_000)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', touch)
    }
  }, [])
  return null
}
