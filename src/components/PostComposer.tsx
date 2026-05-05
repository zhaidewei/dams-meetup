'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Sparkles, AlertTriangle, X } from 'lucide-react'
import { createPostAction, type PostFormState } from '@/lib/actions/posts'
import { POST_MAX_CHARS, MATCH_INTENT_MAX_CHARS } from '@/lib/constants'
import type { SectionId } from '@/lib/sections'
import { displayName, displayMeta } from '@/lib/display'
import { PollComposer } from './PollComposer'

const initial: PostFormState = { error: null }

type Props = {
  defaultNickname: string | null
  defaultCompany: string | null
  defaultContactHandle: string | null
  isVip: boolean
  vipName: string | null
  vipTitle: string | null
  section: SectionId
  // issue #34: 用户是否已同意把内容发给 DeepSeek 处理。
  // false → 在 AI 撮合 box 里追加一个 checkbox，必须勾选才能发送 intent。
  // true  → checkbox 不渲染，已是常态。
  aiConsentGiven: boolean
}

// IMPORTANT: textareas here are intentionally uncontrolled.
// On iPhone Chrome, this 'use client' component's React event listeners
// (onChange, onCompositionEnd, onClick) were not firing — likely a
// hydration boundary issue we couldn't pin down (logout had the same
// symptom and was fixed by switching to native form action).
//
// With uncontrolled textareas + form action={formAction}:
//   - DOM value isn't reset by React re-renders
//   - submit goes through native HTML form path (progressive enhancement),
//     so the post is sent even if React event handlers never bound
//   - char counter is best-effort UI; it stops updating if hydration fails,
//     but nothing else breaks.
//
// 布局结构（issue #18 F 减负后）：
//   首屏：textarea + tags + 身份预览 + 发帖按钮
//   折叠 1（编辑身份）：nickname / company / contact / show_contact 都在里面
//   折叠 2（AI 撮合）：发帖按钮旁的 secondary action，点开才显示 textarea
export function PostComposer({
  defaultNickname,
  defaultCompany,
  defaultContactHandle,
  isVip,
  vipName,
  vipTitle,
  section,
  aiConsentGiven,
}: Props) {
  const [state, formAction, isPending] = useActionState(createPostAction, initial)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)
  const [mode, setMode] = useState<'text' | 'poll'>('text')
  const [bodyLen, setBodyLen] = useState(0)
  const [matchLen, setMatchLen] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  // Reset uncontrolled form fields after a successful submit. The new
  // useActionState identity (and state.ok) flips after the server action
  // resolves, so this effect runs once per successful post.
  useEffect(() => {
    if (!state.ok) return
    formRef.current?.reset()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate sync of UI counters with form reset triggered by external (server action) state change
    setBodyLen(0)
    setMatchLen(0)
    setMatchOpen(false)
  }, [state])

  if (mode === 'poll') {
    return <PollComposer section={section} onCancel={() => setMode('text')} />
  }

  const remaining = POST_MAX_CHARS - bodyLen
  const matchRemaining = MATCH_INTENT_MAX_CHARS - matchLen

  const previewUser = {
    nickname: defaultNickname,
    company: defaultCompany,
    is_vip: isVip,
    vip_name: vipName,
    vip_title: vipTitle,
  }
  const previewName = displayName(previewUser)
  const previewMeta = displayMeta(previewUser)
  const displayCompanyLine = previewMeta ? ` · ${previewMeta}` : ''
  // 匿名 = 没填昵称 + 不是嘉宾。匿名状态下仍允许委托 AI 撮合，但展开 box 时
  // 提示「对方找不到你 / 你也没法 DM」，引导先去填身份。判断基于 server-rendered
  // 初值；用户在身份折叠里现填后这里不会立即重算（uncontrolled inputs），可接受
  // — 提示是非阻塞的友好引导，过期一会儿不致命。
  const isAnon = !defaultNickname && !isVip

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <input type="hidden" name="section" value={section} />
      {isVip && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setMode('poll')}
            className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            发起投票（嘉宾）
          </button>
        </div>
      )}

      <textarea
        name="body"
        defaultValue=""
        onInput={(e) => setBodyLen(e.currentTarget.value.length)}
        maxLength={POST_MAX_CHARS}
        placeholder="说点什么…"
        rows={3}
        className="w-full resize-none rounded-md border-0 p-0 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <button
          type="button"
          onClick={() => setIdentityOpen((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-zinc-100"
        >
          <span className="font-medium text-zinc-700">{previewName}</span>
          <span>{displayCompanyLine}</span>
          <span className="text-zinc-400">{identityOpen ? '收起' : '编辑身份'}</span>
        </button>
        <span className={remaining < 0 ? 'text-red-500' : ''}>{remaining}</span>
      </div>

      {identityOpen && (
        <div className="space-y-2 rounded-lg bg-zinc-50 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              name="nickname"
              defaultValue={defaultNickname ?? ''}
              placeholder="昵称（留空显示为匿名）"
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            <input
              name="company"
              defaultValue={defaultCompany ?? ''}
              placeholder="公司"
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            <input
              name="contact_handle"
              defaultValue={defaultContactHandle ?? ''}
              placeholder="联系方式 LinkedIn / 邮箱 / 微信"
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400 sm:col-span-2"
            />
          </div>
          <p className="text-[11px] text-zinc-500">
            联系方式由资料卡公开 — 别人点你头像即可查看 / 复制 / DM。
          </p>
        </div>
      )}

      {matchOpen && (
        <div className="space-y-1.5 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-baseline justify-between text-xs text-blue-900">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="size-3.5" aria-hidden />
              委托 AI 撮合（私下，仅你可见）
            </span>
            <button
              type="button"
              onClick={() => setMatchOpen(false)}
              className="rounded p-1 text-blue-700 hover:bg-blue-100"
              aria-label="收起 AI 撮合"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          {isAnon && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <div className="flex-1 space-y-0.5">
                <p>
                  你目前是<span className="font-medium">匿名</span>状态：撮合到的人
                  <span className="font-medium">没法找到你</span>，你也无法对他们发私信。
                </p>
                <button
                  type="button"
                  onClick={() => setIdentityOpen(true)}
                  className="font-medium text-amber-800 underline underline-offset-2 hover:text-amber-700"
                >
                  去填身份 →
                </button>
              </div>
            </div>
          )}
          <textarea
            name="match_intent"
            defaultValue=""
            onInput={(e) => setMatchLen(e.currentTarget.value.length)}
            maxLength={MATCH_INTENT_MAX_CHARS}
            placeholder="比如：想找 Booking 的同学聊内推 / 想找会 dbt 的人 / 想找做 PM 的同行聊聊"
            rows={2}
            className="w-full resize-none rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none"
          />
          <div className="space-y-1 text-[11px] text-blue-700">
            <p>这条不进时间线，结果以回帖形式仅你可见。</p>
            <p className="flex items-start gap-1 text-blue-800">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                内容会发往 DeepSeek API。请勿在此填邮箱 / 电话 / 微信号；系统已做基础过滤但不能保证 100% 拦截。
              </span>
            </p>
            <div className="flex justify-end">
              <span className={matchRemaining < 0 ? 'text-red-600' : ''}>{matchRemaining}</span>
            </div>
          </div>
          {!aiConsentGiven && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-blue-300 bg-white/80 px-2.5 py-2 text-[12px] text-blue-900">
              <input
                type="checkbox"
                name="ai_consent"
                className="mt-0.5 size-4 shrink-0 accent-blue-600"
              />
              <span>
                我同意把<span className="font-medium">这条需求</span>以及我在此次活动里的
                <span className="font-medium">公开发帖</span>发给 DeepSeek API 处理（用于撮合）。同意一次后不再询问。
              </span>
            </label>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMatchOpen((v) => !v)}
          aria-pressed={matchOpen}
          className={
            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ' +
            (matchOpen
              ? 'border-blue-400 bg-blue-100 text-blue-900'
              : 'border-zinc-200 bg-white text-zinc-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800')
          }
        >
          <Sparkles className="size-3.5" aria-hidden />
          {matchOpen ? '收起 AI 撮合' : '委托 AI 撮合'}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
        >
          {isPending ? '发送中…' : '发帖'}
        </button>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
