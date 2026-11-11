'use client'

import { useState } from 'react'

export function RecoveryLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.href).href)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-600">请妥善保存链接。换手机或浏览器后，用它恢复身份。</p>
      <div className="flex flex-wrap items-center gap-4">
        <button onClick={() => void copy()} className="rounded bg-sky-900 px-4 py-2 text-white">
          复制恢复链接
        </button>
        <a href={path} className="text-sm underline">恢复链接</a>
      </div>
      {copied && <p role="status">恢复链接已复制。</p>}
      {copyFailed && <p role="status">请长按或右键点击「恢复链接」复制链接。</p>}
    </div>
  )
}
