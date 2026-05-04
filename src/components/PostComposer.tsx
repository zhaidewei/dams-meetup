'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
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
  defaultShowContact: boolean
  isVip: boolean
  vipName: string | null
  vipTitle: string | null
  section: SectionId
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
  defaultShowContact,
  isVip,
  vipName,
  vipTitle,
  section,
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
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
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
        placeholder="说点什么…  (#标签 用空格分隔)"
        rows={3}
        className="w-full resize-none rounded-md border-0 p-0 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0"
      />

      <input
        name="tags"
        placeholder="标签：求助 内推 组队 (空格分隔，最多 5 个)"
        className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none"
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
          <label className="flex items-center gap-2 text-xs text-zinc-600">
            <input
              type="checkbox"
              name="show_contact"
              defaultChecked={defaultShowContact}
              className="size-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
            />
            这条帖子里显示我的联系方式
          </label>
        </div>
      )}

      {matchOpen && (
        <div className="space-y-1.5 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
          <div className="flex items-baseline justify-between text-xs text-sky-900">
            <span className="font-medium">
              <span aria-hidden className="mr-1">🤖</span>
              委托 AI 撮合（私下，仅你可见）
            </span>
            <button
              type="button"
              onClick={() => setMatchOpen(false)}
              className="rounded px-1 text-sky-700 hover:bg-sky-100"
              aria-label="收起 AI 撮合"
            >
              ✕
            </button>
          </div>
          {isAnon && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              <span aria-hidden>⚠️</span>
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
            className="w-full resize-none rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-zinc-400 focus:border-sky-400 focus:outline-none"
          />
          <div className="space-y-1 text-[11px] text-sky-700">
            <p>这条不进时间线，结果以回帖形式仅你可见。</p>
            <p className="text-sky-800">
              ⚠️ 内容会发往 DeepSeek API。请勿在此填邮箱 / 电话 / 微信号；系统已做基础过滤但不能保证 100% 拦截。
            </p>
            <div className="flex justify-end">
              <span className={matchRemaining < 0 ? 'text-red-600' : ''}>{matchRemaining}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMatchOpen((v) => !v)}
          aria-pressed={matchOpen}
          className={
            'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ' +
            (matchOpen
              ? 'border-sky-400 bg-sky-100 text-sky-900'
              : 'border-zinc-200 bg-white text-zinc-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800')
          }
        >
          <span aria-hidden className="mr-1">🤖</span>
          {matchOpen ? '收起 AI 撮合' : '委托 AI 撮合'}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
        >
          {isPending ? '发送中…' : '发帖'}
        </button>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
