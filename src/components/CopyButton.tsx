'use client'

import { useState } from 'react'

type Props = {
  text: string
  className?: string
}

export function CopyButton({ text, className }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Browser blocked clipboard; user can still select the input manually
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ??
        'shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800'
      }
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}
