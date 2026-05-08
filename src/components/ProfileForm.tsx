'use client'

import { useActionState } from 'react'
import { updateProfileAction, type ProfileFormState } from '@/lib/actions/profile'
import { MATCH_INTENT_MAX_CHARS } from '@/lib/constants'

const initial: ProfileFormState = { error: null }

type Props = {
  defaultNickname: string | null
  defaultCompany: string | null
  defaultContactHandle: string | null
  defaultShowContact: boolean
  defaultMatchOffer: string | null
  hasAiConsent: boolean
  isVip: boolean
  vipName: string | null
  vipTitle: string | null
}

export function ProfileForm({
  defaultNickname,
  defaultCompany,
  defaultContactHandle,
  defaultShowContact,
  defaultMatchOffer,
  hasAiConsent,
  isVip,
  vipName,
  vipTitle,
}: Props) {
  // CLAUDE.md known quirk：iPhone Chrome / 桌面 Chrome 密码管理器 extension
  // 注入 attribute 到 input / textarea，会触发 React 19 root-level hydration
  // mismatch。修复：走 React 19 form action（progressive enhancement），
  // 而不是 onSubmit + manual FormData。
  const [state, formAction, isPending] = useActionState(updateProfileAction, initial)

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-zinc-900">我的身份</h2>

      {isVip && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          嘉宾默认显示 <span className="font-medium">{vipName}</span>
          {vipTitle && ` · ${vipTitle}`}。下方填昵称 / 公司可覆盖默认。
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={isVip ? '昵称（留空用嘉宾默认名）' : '昵称（留空显示为匿名）'}>
          <input
            name="nickname"
            defaultValue={defaultNickname ?? ''}
            placeholder="昵称"
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </Field>
        <Field label={isVip ? '公司（留空用嘉宾默认 title）' : '公司'}>
          <input
            name="company"
            defaultValue={defaultCompany ?? ''}
            placeholder="公司"
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="联系方式 LinkedIn / 邮箱 / 微信">
            <input
              name="contact_handle"
              defaultValue={defaultContactHandle ?? ''}
              placeholder="例如 linkedin.com/in/your-id"
              className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </Field>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-700">
        <input
          type="checkbox"
          name="show_contact"
          defaultChecked={defaultShowContact}
          className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-400"
        />
        公开联系方式（其他人点你头像可看 / 复制）
      </label>

      <div className="border-t border-zinc-100 pt-3">
        <Field
          label={`AI 撮合偏好 — 我能提供什么（仅 AI 可见，最多 ${MATCH_INTENT_MAX_CHARS} 字）`}
        >
          <textarea
            name="match_offer"
            defaultValue={defaultMatchOffer ?? ''}
            placeholder="例：在 Booking 做了 5 年 SRE，可以聊面试 / 内推 / 实习"
            maxLength={MATCH_INTENT_MAX_CHARS}
            rows={3}
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </Field>
        <p className="mt-1 text-[11px] text-zinc-500">
          写下你能提供的经验 / 资源 / 视角。AI 帮人撮合时会私下引用，提高你被推荐的概率。
          <span className="text-amber-700"> 内容会通过 AI 推荐理由展示给被撮合的人，等同于你公开声明这些资源。</span>
        </p>
        {!hasAiConsent && (
          <label className="mt-2 flex items-start gap-2 text-[11px] text-zinc-700">
            <input
              type="checkbox"
              name="ai_consent"
              className="mt-0.5 size-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-400"
            />
            <span>同意把内容发给 DeepSeek 处理（仅写非空撮合偏好时需要）</span>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {state.ok ? '已保存' : ' '}
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
        >
          {isPending ? '保存中…' : '保存'}
        </button>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-zinc-600">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}
