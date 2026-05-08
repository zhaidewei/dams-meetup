'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import {
  setCurrentSectionAction,
  clearCurrentSectionAction,
  startQaAction,
  exitScreenModeAction,
  startLotteryAction,
  setScreenFilterAction,
} from '@/lib/actions/event-state'
import { SECTIONS, type SectionId } from '@/lib/sections'
import type { VipForDropdown, ScreenModeState } from '@/lib/queries/event-state'

type Props = {
  currentSection: SectionId | null
  modeState: ScreenModeState
  vips: VipForDropdown[]
}

// /admin (issue #45) — 移动端优先的主办方控制台。从 /screen 的 ScreenAdminBar 拆出
// 来，layout 重写：撑满宽度、按钮 py-3、段落清晰；逻辑（state + server actions）
// 一致。手机改 filter 走 server state（event_state.screen_filter_section），所有
// /screen tab 自动同步。
export function AdminConsole({ currentSection, modeState, vips }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pendingHostId, setPendingHostId] = useState<string>(
    modeState.qa_host_user_id ?? vips[0]?.user_id ?? '',
  )
  const [mustHavePosted, setMustHavePosted] = useState(false)
  const [excludePreviousWinners, setExcludePreviousWinners] = useState(true)
  const [excludeVips, setExcludeVips] = useState(true)
  const [enableWeights, setEnableWeights] = useState(true)

  const screenMode = modeState.mode
  const filterSection = modeState.screen_filter_section

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
    setError(null)
    startTransition(async () => {
      const res = await setScreenFilterAction(id)
      if (res.error) setError(res.error)
    })
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

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-zinc-900">主办方控制台</h1>
        <Link
          href="/screen"
          className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
        >
          打开大屏
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      </header>

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* 1. 大屏模式 — QA / 抽奖 / 默认骨架。优先级最高，活动期间常用 */}
      <Card legend="大屏模式">
        <p className="mb-2 text-sm">
          当前：
          <span className="font-medium text-zinc-900">
            {screenMode === 'qa'
              ? `QA · ${vips.find((v) => v.user_id === modeState.qa_host_user_id)?.name ?? '?'}`
              : screenMode === 'lottery'
                ? '抽奖'
                : '默认骨架'}
          </span>
        </p>
        {screenMode === 'default' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-600">
                嘉宾 QA — 选目标嘉宾后开始
              </label>
              <select
                value={pendingHostId}
                onChange={(e) => setPendingHostId(e.target.value)}
                disabled={pending || vips.length === 0}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 disabled:opacity-50"
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
                className="w-full rounded-md bg-rose-500 py-2.5 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50"
              >
                开始 QA
              </button>
            </div>

            <div className="space-y-2 border-t border-zinc-100 pt-3">
              <label className="block text-xs font-medium text-zinc-600">
                抽奖 v2 — 池子取近 1 小时活跃过的人，演到停才定 winner
              </label>
              <CheckRow
                checked={mustHavePosted}
                onChange={setMustHavePosted}
                label="必须参与过（帖/回复/投票）"
              />
              <CheckRow
                checked={excludePreviousWinners}
                onChange={setExcludePreviousWinners}
                label="排除上轮中奖者"
              />
              <CheckRow
                checked={excludeVips}
                onChange={setExcludeVips}
                label="排除 VIP 嘉宾"
              />
              <CheckRow
                checked={enableWeights}
                onChange={setEnableWeights}
                label="启用加权（发帖+1，被回复+1，封顶 3）"
              />
              <button
                type="button"
                onClick={startLottery}
                disabled={pending}
                className="w-full rounded-md bg-amber-500 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                开始抽奖
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {screenMode === 'qa' && (
              <p className="text-xs leading-relaxed text-zinc-500">
                问题已答：在大屏 tab 鼠标移到问题卡片右上角 ✓ 单条标记。
              </p>
            )}
            <button
              type="button"
              onClick={exitMode}
              disabled={pending}
              className="w-full rounded-md bg-zinc-200 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-300 disabled:opacity-50"
            >
              {screenMode === 'qa' ? '结束 QA' : '结束抽奖'}（回默认骨架）
            </button>
          </div>
        )}
      </Card>

      {/* 2. 当前 LIVE 板块 — 影响 /feed LIVE 红标 + EventHero */}
      <Card legend="当前 LIVE 板块">
        <p className="mb-2 text-sm">
          当前：
          <span className="font-medium text-zinc-900">
            {currentSection ? labelOf(currentSection) : '（按时间表 / 空档）'}
          </span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SECTIONS.map((s) => {
            const active = s.id === currentSection
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => pickSection(s.id)}
                disabled={pending}
                className={
                  'rounded-md py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ' +
                  (active
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')
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
          className="mt-2 w-full rounded-md border border-zinc-300 bg-white py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          清除覆写（回落到时间表）
        </button>
      </Card>

      {/* 3. 大屏视图筛选 — 写 event_state.screen_filter_section，所有 /screen 同步 */}
      <Card legend="大屏视图筛选">
        <p className="mb-2 text-xs leading-relaxed text-zinc-500">
          仅影响大屏显示哪些板块的帖子，不影响 /feed、不影响 LIVE 红标。手机改了所有大屏 tab 同步。
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setFilter(null)}
            disabled={pending}
            className={
              'rounded-md py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ' +
              (filterSection === null
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')
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
                disabled={pending}
                className={
                  'rounded-md py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ' +
                  (active
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')
                }
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </Card>
    </main>
  )
}

function Card({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <legend className="px-2 text-sm font-semibold text-zinc-900">{legend}</legend>
      {children}
    </fieldset>
  )
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
      />
      {label}
    </label>
  )
}

function labelOf(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)?.label ?? id
}
