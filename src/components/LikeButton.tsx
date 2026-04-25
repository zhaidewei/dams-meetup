'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleLikeAction } from '@/lib/actions/likes'

type Props = {
  postId: number
  count: number
  liked: boolean
}

export function LikeButton({ postId, count, liked }: Props) {
  const [optimistic, setOptimistic] = useOptimistic(
    { count, liked },
    (state) => ({
      count: state.count + (state.liked ? -1 : 1),
      liked: !state.liked,
    }),
  )
  const [, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      setOptimistic(undefined)
      await toggleLikeAction(postId)
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
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
  )
}
