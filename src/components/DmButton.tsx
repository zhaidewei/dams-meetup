'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startThreadAction } from '@/lib/actions/dm'

type Props = { toUserId: string }

export function DmButton({ toUserId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      const res = await startThreadAction(toUserId)
      if (res.error || !res.threadId) {
        setError(res.error ?? '打开私信失败')
        return
      }
      router.push(`/me/dm/${res.threadId}`)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50"
        aria-label="私信"
      >
        <span>✉</span>
        <span>私信</span>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  )
}
