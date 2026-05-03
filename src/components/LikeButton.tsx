'use client'

import { useOptimistic } from 'react'
import { toggleLikeFormAction } from '@/lib/actions/likes'

type Props = {
  postId: number
  count: number
  liked: boolean
}

// Form-action based: a native form submit reaches the server even when
// React event listeners fail to bind on iPhone Chrome (see PostComposer for
// the underlying story). Optimistic update only fires when React hydration
// is healthy; on broken hydration it falls back to a server round-trip,
// which is still functionally correct.
export function LikeButton({ postId, count, liked }: Props) {
  const [optimistic, setOptimistic] = useOptimistic(
    { count, liked },
    (state) => ({
      count: state.count + (state.liked ? -1 : 1),
      liked: !state.liked,
    }),
  )

  async function action(formData: FormData) {
    setOptimistic(undefined)
    await toggleLikeFormAction(formData)
  }

  return (
    <form action={action} className="inline">
      <input type="hidden" name="post_id" value={postId} />
      <button
        type="submit"
        className={
          'flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors ' +
          (optimistic.liked
            ? 'text-rose-600 hover:bg-rose-50'
            : 'text-zinc-500 hover:bg-zinc-100')
        }
        aria-pressed={optimistic.liked}
        aria-label={optimistic.liked ? '取消点赞' : '点赞'}
      >
        <span>{optimistic.liked ? '❤' : '♡'}</span>
        <span>{optimistic.count}</span>
      </button>
    </form>
  )
}
