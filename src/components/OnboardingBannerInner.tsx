'use client'

import { useEffect, useState } from 'react'
import { Hand, X } from 'lucide-react'
import { dismissOnboardingAction } from '@/lib/actions/onboarding'

// 老的 localStorage key — 已经在旧版点过 dismiss 的用户，这次不要再骚扰。
// 进来 mount 时若发现这个标记，就静默 sync 一次 cookie 然后关掉。
const LEGACY_LS_KEY = 'dams-onboarding-v2'

export function OnboardingBannerInner() {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    try {
      if (localStorage.getItem(LEGACY_LS_KEY) === '1') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot migration: SSR has no localStorage so banner defaults open; close on hydrate if legacy LS marker exists
        setOpen(false)
        void dismissOnboardingAction()
      }
    } catch {
      // localStorage 不可用就算了，cookie 缺失会让用户多看一次，可接受
    }
  }, [])

  function dismiss() {
    setOpen(false)
    // 即时关掉 UI，不等 server 往返；server action fire-and-forget 写 cookie。
    void dismissOnboardingAction()
    try {
      localStorage.setItem(LEGACY_LS_KEY, '1')
    } catch {
      // ignore
    }
  }

  if (!open) return null

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
          <Hand className="size-4" aria-hidden />
          第一次来？四件事
        </h3>
        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 rounded p-1 text-blue-700 hover:bg-blue-100"
          aria-label="关闭"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <ul className="space-y-1.5 text-sm text-blue-900">
        <li>
          <span className="font-medium">默认匿名 = 只能看 + 点赞</span>
          。想发帖 / 回复 / 私信 / 被 AI 撮合 → 去「我」tab 填昵称（可以只填昵称、不填公司联系方式）。
        </li>
        <li>
          <span className="font-medium">AI 撮合</span>
          ：发帖时可以暗中委托「想找 Booking 的同学聊内推」之类，结果只回到你自己的「我」tab。
          <span className="text-blue-700"> 撮合双方都需要昵称，对方才能联系到你。</span>
        </li>
        <li>
          <span className="font-medium">想被 AI 找到？</span>
          在「我」tab 写「我能提供什么」（经验 / 资源 / 视角），AI 帮人撮合时会私下引用你，提高被推荐概率。
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
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          知道了，不再提示
        </button>
      </div>
    </div>
  )
}
