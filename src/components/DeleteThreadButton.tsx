'use client'

import { Trash2 } from 'lucide-react'
import { deleteThreadAction } from '@/lib/actions/dm'

type Props = {
  threadId: number
  // 'icon' = 紧凑 icon 按钮（列表行右侧）；'text' = 带文字（thread 详情页 header）
  variant?: 'icon' | 'text'
  className?: string
}

// 走 form action 而不是 onClick，保 iPhone Chrome 上即使 hydration 失败也能用
// （progressive enhancement，跟 LogoutButton 同模式）。confirm 在 onSubmit
// 里返回 false 阻止提交。
export function DeleteThreadButton({ threadId, variant = 'icon', className }: Props) {
  return (
    <form
      action={deleteThreadAction.bind(null, threadId)}
      onSubmit={(e) => {
        if (!window.confirm('删除整段对话？\n双方都将不可见，无法撤销。')) {
          e.preventDefault()
        }
      }}
      className={variant === 'icon' ? 'inline-flex' : 'inline-block'}
    >
      {variant === 'icon' ? (
        <button
          type="submit"
          aria-label="删除对话"
          className={
            (className ?? '') +
            ' rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600'
          }
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      ) : (
        <button
          type="submit"
          className={
            (className ?? '') +
            ' inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-rose-50 hover:text-rose-600'
          }
        >
          <Trash2 className="size-3.5" aria-hidden />
          删除对话
        </button>
      )}
    </form>
  )
}
