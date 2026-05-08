'use client'

import { displayName, displayMeta } from '@/lib/display'
import { Avatar } from './Avatar'

type Props = {
  user: {
    id: string
    nickname: string | null
    company: string | null
    is_vip: boolean
    vip_name: string | null
    vip_title: string | null
  }
}

// /me 顶部超薄身份条：让用户进 /me 第一眼看到自己是谁。
// 「编辑」按钮点开下方折叠的「设置」<details id="settings">，并滚动过去。
export function MeIdentityBar({ user }: Props) {
  const name = displayName(user)
  const meta = displayMeta(user)
  const isAnon = !user.nickname && !user.is_vip

  function openSettings() {
    const el = document.getElementById('settings')
    if (el && el instanceof HTMLDetailsElement) {
      el.open = true
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-3 shadow-sm">
      <button
        type="button"
        onClick={openSettings}
        aria-label="编辑个人资料"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left hover:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <Avatar seed={user.id} user={user} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="truncate font-semibold text-zinc-900">{name}</span>
            {meta && <span className="truncate text-zinc-500">· {meta}</span>}
            {user.is_vip && (
              <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-800">
                嘉宾
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {isAnon
              ? '当前匿名 — 只能看 + 点赞；填昵称解锁发帖 / 回复 / 私信 / 被撮合'
              : '点编辑改昵称 / 公司 / 联系方式'}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={openSettings}
        className="shrink-0 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
      >
        编辑
      </button>
    </div>
  )
}
