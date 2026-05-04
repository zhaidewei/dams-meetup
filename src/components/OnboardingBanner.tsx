'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'dams-onboarding-v1'

// 首次进 /feed 顶部展示一次的轻量提示。dismiss 后写 localStorage，下次不再显示。
// key 带 v1 — 以后改了内容可以 bump 让老用户重新看一次。
//
// SSR 时不渲染（避免 hydration 不一致），全部由 useEffect 决定显示。
export function OnboardingBanner() {
  // 'mounted' 标志保证 server / 首次客户端 render 都返回 null（hydration 一致），
  // 真正的"是否显示"判断在 effect 里完成。
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 客户端 mount 后读 localStorage 决定是否显示，是合法的 SSR 一致性 pattern
    setMounted(true)
    try {
      if (localStorage.getItem(STORAGE_KEY) !== '1') setOpen(true)
    } catch {
      // localStorage 不可用（隐身 / iframe）— 默认不打扰用户
    }
  }, [])

  function dismiss() {
    setOpen(false)
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
  }

  if (!mounted || !open) return null

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-sky-900">
          <span aria-hidden className="mr-1">👋</span>
          第一次来？三件事
        </h3>
        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 rounded p-1 text-sky-700 hover:bg-sky-100"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
      <ul className="space-y-1.5 text-sm text-sky-900">
        <li>
          <span className="font-medium">默认匿名</span>
          ：发帖不显示你是谁。想让人认出你 → 点「编辑身份」填昵称 / 公司 / 联系方式。
        </li>
        <li>
          <span className="font-medium">AI 撮合</span>
          ：发帖时可以暗中委托「想找 Booking 的同学聊内推」之类，结果只回到你自己的「我」tab。
          <span className="text-sky-700"> 想让对方找到你 → 先填昵称 + 联系方式。</span>
        </li>
        <li>
          <span className="font-medium">嘉宾发投票</span>
          ：圆桌嘉宾可以发投票，你扫一眼现场就知道大家想怎么选。
        </li>
      </ul>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
        >
          知道了，不再提示
        </button>
      </div>
    </div>
  )
}
