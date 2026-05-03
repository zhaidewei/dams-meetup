'use client'

import { logoutAction } from '@/lib/actions/logout'

// Form-action based logout: works even if React hydration fails for this
// component (which we hit on iPhone Chrome — onClick handlers were not firing
// for some specific 'use client' components, see issue debugged 2026-05-03).
// The native form submit is the progressive-enhancement fallback.
export function LogoutButton() {
  function clearLocal() {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // ignore — cookies are the source of truth
    }
  }

  return (
    <form
      action={logoutAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            '确认退出？\n\n退出会清除本浏览器的 cookie 和本地缓存。\n只有保存了「恢复链接」才能找回当前身份。',
          )
        ) {
          e.preventDefault()
          return
        }
        clearLocal()
      }}
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <h2 className="mb-1 text-sm font-semibold text-zinc-900">退出登录</h2>
      <p className="mb-3 text-xs text-zinc-500">
        退出会清除本机的身份缓存。下次进入需要用恢复链接或活动密码。
        <br />
        <span className="text-red-600">
          只有保存了「恢复链接」才能找回当前身份与发帖记录。请先复制保存。
        </span>
      </p>
      <button
        type="submit"
        className="block w-full touch-manipulation rounded-md border border-red-300 bg-white px-3 py-2 text-center text-sm text-red-600 hover:bg-red-50 active:bg-red-100"
      >
        退出登录
      </button>
    </form>
  )
}
