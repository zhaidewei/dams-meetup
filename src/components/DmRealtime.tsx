'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase/client'

const DEBOUNCE_MS = 500

// 订阅 dm_notifications 上 recipient_id = me 的 INSERT。收到事件后
// router.refresh() 重新拉服务端数据（线程列表 + 单线程页 + Header 红点）。
//
// 安全：dm_notifications 表只携 (recipient_id, thread_id) 元数据，没有
// body / sender。dm_messages 不在 publication 里。详见 0012 migration 注释。
type Props = { viewerId: string }
export function DmRealtime({ viewerId }: Props) {
  const router = useRouter()

  useEffect(() => {
    const sb = getBrowserSupabase()
    let timer: ReturnType<typeof setTimeout> | null = null

    function bump() {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        router.refresh()
      }, DEBOUNCE_MS)
    }

    const channel = sb
      .channel(`dm-inbox-${viewerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_notifications',
          filter: `recipient_id=eq.${viewerId}`,
        },
        bump,
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      sb.removeChannel(channel)
    }
  }, [router, viewerId])

  return null
}
