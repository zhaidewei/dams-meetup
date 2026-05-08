'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Settings, X } from 'lucide-react'
import {
  setCurrentSectionAction,
  clearCurrentSectionAction,
  startQaAction,
  exitScreenModeAction,
  startLotteryAction,
} from '@/lib/actions/event-state'
import { SECTIONS, isSectionId, type SectionId } from '@/lib/sections'
import type { ScreenMode } from '@/lib/types'
import type { VipForDropdown } from '@/lib/queries/event-state'

type Props = {
  currentSection: SectionId | null
  screenMode: ScreenMode
  qaHostUserId: string | null
  vips: VipForDropdown[]
}

// /screen 右下角浮动控制条 — 只主办方（admin cookie 已 set）能看到。
// 投影时如果是镜像屏，控制条会被一起投出去，所以默认折叠成一个小图标。
export function ScreenAdminBar({ currentSection, screenMode, qaHostUserId, vips }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterRaw = searchParams.get('section')
  const filterSection: SectionId | null = isSectionId(filterRaw) ? filterRaw : null

  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pendingHostId, setPendingHostId] = useState<string>(qaHostUserId ?? vips[0]?.user_id ?? '')
  const [mustHavePosted, setMustHavePosted] = useState(false)
  const [excludePreviousWinners, setExcludePreviousWinners] = useState(true)
  const [excludeVips, setExcludeVips] = useState(true)
  const [enableWeights, setEnableWeights] = useState(true)

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

  function startQa() {
    if (!pendingHostId) {
      setError('请先选择嘉宾')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await startQaAction(pendingHostId)
      if (res.error) setError(res.error)
    })
  }

  function exitMode() {
    setError(null)
    startTransition(async () => {
      const res = await exitScreenModeAction()
      if (res.error) setError(res.error)
    })
  }

  function startLottery() {
    setError(null)
    startTransition(async () => {
      const res = await startLotteryAction({
        must_have_posted: mustHavePosted,
        exclude_previous_winners: excludePreviousWinners,
        exclude_vips: excludeVips,
        enable_weights: enableWeights,
      })
      if (res.error) setError(res.error)
    })
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
        {/* 0. 大屏模式 — QA / 抽奖 / 默认骨架。优先级最高放最上面，活动期间常用 */}
        <fieldset>
          <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            大屏模式
          </legend>
          <p className="mb-1.5 text-xs">
            <span className="text-zinc-100">
              当前：
              {screenMode === 'qa'
                ? `QA · ${vips.find((v) => v.user_id === qaHostUserId)?.name ?? '?'}`
                : screenMode === 'lottery'
                  ? '抽奖'
                  : '默认骨架'}
            </span>
          </p>
          {screenMode === 'default' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] text-zinc-400">
                  嘉宾 QA — 选目标嘉宾后开始
                </label>
                <select
                  value={pendingHostId}
                  onChange={(e) => setPendingHostId(e.target.value)}
                  disabled={pending || vips.length === 0}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 disabled:opacity-50"
                >
                  {vips.length === 0 && <option value="">（暂无 VIP 已登录）</option>}
                  {vips.map((v) => (
                    <option key={v.user_id} value={v.user_id}>
                      {v.name}
                      {v.title ? ` · ${v.title}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={startQa}
                  disabled={pending || !pendingHostId}
                  className="w-full rounded-md bg-rose-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-rose-400 disabled:opacity-50"
                >
                  开始 QA
                </button>
              </div>

              <div className="space-y-1.5 border-t border-zinc-800 pt-2">
                <label className="block text-[11px] text-zinc-400">
                  抽奖 v2 — 池子取近 1 小时活跃过的人，演到停才定 winner
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={mustHavePosted}
                    onChange={(e) => setMustHavePosted(e.target.checked)}
                    className="size-3.5 rounded border-zinc-600 bg-zinc-800"
                  />
                  必须参与过（帖/回复/投票）
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={excludePreviousWinners}
                    onChange={(e) => setExcludePreviousWinners(e.target.checked)}
                    className="size-3.5 rounded border-zinc-600 bg-zinc-800"
                  />
                  排除上轮中奖者
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={excludeVips}
                    onChange={(e) => setExcludeVips(e.target.checked)}
                    className="size-3.5 rounded border-zinc-600 bg-zinc-800"
                  />
                  排除 VIP 嘉宾
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-200">
                  <input
                    type="checkbox"
                    checked={enableWeights}
                    onChange={(e) => setEnableWeights(e.target.checked)}
                    className="size-3.5 rounded border-zinc-600 bg-zinc-800"
                  />
                  启用加权（发帖+1，被回复+1，封顶 3）
                </label>
                <button
                  type="button"
                  onClick={startLottery}
                  disabled={pending}
                  className="w-full rounded-md bg-amber-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-400 disabled:opacity-50"
                >
                  开始抽奖
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {screenMode === 'qa' && (
                <p className="text-[11px] leading-relaxed text-zinc-400">
                  问题已答 → 鼠标移到问题卡片右上角 ✓ 单条标记。
                </p>
              )}
              <button
                type="button"
                onClick={exitMode}
                disabled={pending}
                className="w-full rounded-md bg-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
              >
                {screenMode === 'qa' ? '结束 QA' : '结束抽奖'}（回默认骨架）
              </button>
            </div>
          )}
        </fieldset>

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
                      ? 'bg-blue-500 text-white'
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
                  ? 'bg-blue-500 text-white'
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
                      ? 'bg-blue-500 text-white'
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
