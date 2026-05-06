'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase/client'

// 2.5s debounce: under 250 concurrent users, write rate can exceed 2/s; a
// 500ms debounce barely coalesced anything and made every refresh hit DB
// repeatedly. 2.5s loses near-zero perceived responsiveness but cuts refresh
// fanout 4-6×.
const DEBOUNCE_MS = 2500

// Subscribes to posts / replies / likes changes via Supabase Realtime and
// triggers a server refetch when something happens. One channel per mount.
//
// Why router.refresh() instead of merging payloads client-side:
//   - feed data is joined with users + reply visibility filtering on the
//     server (see fetchFeed). Reproducing that on the client would
//     duplicate logic and risk leaking author_only AI replies.
//   - we can't reconstruct full feed state from a single-row INSERT
//     payload (need joined author, like counts, etc.). Re-running the
//     server fetch is simpler than maintaining a parallel client cache.
//
// Privacy note: posts table no longer carries match_intent — that column
// moved to post_match_intents in migration 0011, and that table is not in
// the realtime publication. So nothing here can leak it.
export function FeedRealtime() {
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
      .channel('feed-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, bump)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      sb.removeChannel(channel)
    }
  }, [router])

  return null
}
