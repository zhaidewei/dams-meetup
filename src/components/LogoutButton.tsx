'use client'

import { useState, useTransition } from 'react'
import { logoutAction } from '@/lib/actions/logout'

export function LogoutButton() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function confirm() {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // ignore — cookies are the source of truth
    }
    startTransition(() => {
      logoutAction()
    })
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">退出登录</h2>
        <p className="mb-3 text-xs text-zinc-500">
          退出会清除本机的身份缓存。下次进入需要用恢复链接或活动密码。
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          退出登录
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold text-zinc-900">确认退出？</h3>
            <p className="mb-4 text-sm text-zinc-600">
              退出会清除本浏览器的 cookie 和本地缓存。
              <br />
              <span className="text-red-600">
                只有保存了「恢复链接」才能找回当前身份与发帖记录。
              </span>
              <br />
              请确认你已经把恢复链接复制保存好。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={pending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-300"
              >
                {pending ? '退出中…' : '已保存，确认退出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
