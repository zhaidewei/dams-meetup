'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Settings, X } from 'lucide-react'
import {
  setCurrentSectionAction,
  clearCurrentSectionAction,
} from '@/lib/actions/event-state'
import { SECTIONS, isSectionId, type SectionId } from '@/lib/sections'

type Props = {
  currentSection: SectionId | null
}

// /screen 右下角浮动控制条 — 只主办方（admin cookie 已 set）能看到。
// 投影时如果是镜像屏，控制条会被一起投出去，所以默认折叠成一个小图标。
export function ScreenAdminBar({ currentSection }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterRaw = searchParams.get('section')
  const filterSection: SectionId | null = isSectionId(filterRaw) ? filterRaw : null

  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function pickSection(id: SectionId) {
    setError(null)
    startTransition(async () => {
      const res = await setCurrentSectionAction(id)
      if (res.error) setError(res.error)
    })
  }

  function clearOverride() {
    setError(null)
    startTransition(async () => {
      const res = await clearCurrentSectionAction()
      if (res.error) setError(res.error)
    })
  }

  function setFilter(id: SectionId | null) {
    router.push(id ? `/screen?section=${id}` : '/screen')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="主办方控制台"
        className="fixed bottom-3 right-3 z-50 flex size-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/80 text-zinc-100 opacity-30 hover:opacity-100"
      >
        <Settings className="size-4" aria-hidden />
      </button>
    )
  }

  return (
    <div className="fixed bottom-3 right-3 z-50 max-w-xs rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 text-sm text-zinc-100 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-zinc-300">主办方控制台</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="收起"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="space-y-3">
        {/* 1. 设置当前 LIVE 板块 — 影响 /feed 的 LIVE 红标 + EventHero */}
        <fieldset>
          <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            当前 LIVE 板块
          </legend>
          <p className="mb-1.5 text-xs text-zinc-400">
            <span className="text-zinc-100">
              {currentSection ? labelOf(currentSection) : '（按时间表 / 空档）'}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {SECTIONS.map((s) => {
              const active = s.id === currentSection
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickSection(s.id)}
                  disabled={pending}
                  className={
                    'rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ' +
                    (active
                      ? 'bg-indigo-500 text-white'
                      : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700')
                  }
                >
                  {s.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={clearOverride}
            disabled={pending}
            className="mt-1.5 w-full rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            清除覆写（回落到时间表）
          </button>
        </fieldset>

        {/* 2. 大屏视图筛选 — 仅影响这块大屏显示哪些帖子，不写库 */}
        <fieldset>
          <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            大屏视图筛选
          </legend>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={
                'rounded-md px-2 py-1.5 text-xs font-medium transition-colors ' +
                (filterSection === null
                  ? 'bg-indigo-500 text-white'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700')
              }
            >
              全部
            </button>
            {SECTIONS.map((s) => {
              const active = s.id === filterSection
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFilter(s.id)}
                  className={
                    'rounded-md px-2 py-1.5 text-xs font-medium transition-colors ' +
                    (active
                      ? 'bg-indigo-500 text-white'
                      : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700')
                  }
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      </div>

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  )
}

function labelOf(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)?.label ?? id
}
