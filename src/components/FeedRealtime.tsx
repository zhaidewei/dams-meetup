'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase/client'

// Per-client refresh delay = DEBOUNCE_BASE_MS + random(0..JITTER_MS).
// Two jobs:
//   1. Coalesce: bursts of writes in this window collapse into one refresh
//      (existing timer short-circuits subsequent bumps).
//   2. De-herd: without jitter every client wakes at the same offset after a
//      broadcast and fires SSR simultaneously; with 250 clients that's a
//      thundering 250-rps spike per write. Random delay spreads them across
//      the JITTER_MS window, capping peak SSR concurrency at ~N / JITTER_s.
// 1.5–5.5s window: median 3.5s perceived lag (vs prior 2.5s), peak SSR
// concurrency under 250 users drops ~8× (500ms → 4s window).
const DEBOUNCE_BASE_MS = 1500
const JITTER_MS = 4000

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
      const delay = DEBOUNCE_BASE_MS + Math.random() * JITTER_MS
      timer = setTimeout(() => {
        timer = null
        router.refresh()
      }, delay)
    }

    const channel = sb
      .channel('feed-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reply_reactions' }, bump)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      sb.removeChannel(channel)
    }
  }, [router])

  return null
}
