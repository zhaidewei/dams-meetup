'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase/client'

const DEBOUNCE_MS = 500

// /me 页 Realtime：新回复（含 AI 撮合 inline reply） + DM 通知 → router.refresh()。
// 镜像 FeedRealtime 的 debounce 模式。
//
// 不订阅 post_match_intents：该表故意不在 supabase_realtime publication
// 里（0011 物理隔离），订阅了也收不到事件。AI 撮合产生的"有人想找你"
// 是写到 replies 表的 (is_ai=true, mentioned_user_id=me, visibility=author_only)，
// 所以订阅 replies 就够。
type Props = { viewerId: string }
export function MeRealtime({ viewerId }: Props) {
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
      .channel(`me-${viewerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, bump)
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
