'use client'

import { useMemo, useState, useTransition } from 'react'
import { PostCard } from '@/components/PostCard'
import { loadMorePostsAction } from '@/lib/actions/feed'
import type { FeedPost } from '@/lib/queries/posts'
import type { SectionId } from '@/lib/sections'

// 客户端分页：SSR 注入最新一页（initial），用户主动「加载更早」时通过 server
// action 拼接历史。Realtime 触发 router.refresh 时 initial 会更新（最新写入
// 进入 head），allPosts 用 dedup 重算 — head 永远反映最新状态，已加载的 tail
// 不被弹掉。
export function InfiniteFeed({
  initial,
  pageSize,
  section,
  viewerId,
  viewerCanDm,
  viewerIsAdmin,
}: {
  initial: FeedPost[]
  pageSize: number
  section: SectionId
  viewerId: string
  viewerCanDm: boolean
  viewerIsAdmin: boolean
}) {
  const [older, setOlder] = useState<FeedPost[]>([])
  const [pending, startTransition] = useTransition()
  // SSR 首页拿不满 → 已经没有更早的帖。
  const [exhausted, setExhausted] = useState(initial.length < pageSize)
  const [error, setError] = useState<string | null>(null)

  const all = useMemo(() => {
    const seen = new Set(initial.map((p) => p.id))
    return [...initial, ...older.filter((p) => !seen.has(p.id))]
  }, [initial, older])

  async function handleLoadMore() {
    setError(null)
    const cursor = all[all.length - 1]?.created_at
    if (!cursor) return
    startTransition(async () => {
      try {
        const next = await loadMorePostsAction({
          before: cursor,
          section,
          limit: pageSize,
        })
        if (next.length === 0) {
          setExhausted(true)
          return
        }
        // dedup（理论上 server 已 lt cursor，但稳妥起见）
        setOlder((prev) => {
          const ids = new Set([...all.map((p) => p.id), ...prev.map((p) => p.id)])
          return [...prev, ...next.filter((p) => !ids.has(p.id))]
        })
        if (next.length < pageSize) setExhausted(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      }
    })
  }

  if (all.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
        这个板块还没有人发帖。第一条由你来。
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {all.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            viewerId={viewerId}
            viewerCanDm={viewerCanDm}
            viewerIsAdmin={viewerIsAdmin}
          />
        ))}
      </div>
      {!exhausted && (
        // form action 走 React 19 progressive enhancement，避开 iPhone Chrome
        // 注入 __gcruniqueid 触发的 hydration mismatch（参见 CLAUDE.md known
        // quirks）。handleLoadMore 是 client-side function，直接 await server action。
        <form action={handleLoadMore} className="mt-3 flex justify-center">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 shadow-sm transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            {pending ? '加载中…' : '加载更早的帖子'}
          </button>
        </form>
      )}
      {exhausted && all.length > pageSize && (
        <p className="mt-3 text-center text-xs text-zinc-400">— 已加载全部 —</p>
      )}
      {error && (
        <p className="mt-2 text-center text-xs text-rose-600">加载失败：{error}</p>
      )}
    </>
  )
}
