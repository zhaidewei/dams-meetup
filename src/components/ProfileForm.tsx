'use client'

import { useActionState, useTransition } from 'react'
import { updateProfileAction, type ProfileFormState } from '@/lib/actions/profile'

const initial: ProfileFormState = { error: null }

type Props = {
  defaultNickname: string | null
  defaultCompany: string | null
  defaultContactHandle: string | null
  defaultShowContact: boolean
  isVip: boolean
  vipName: string | null
  vipTitle: string | null
}

export function ProfileForm({
  defaultNickname,
  defaultCompany,
  defaultContactHandle,
  defaultShowContact,
  isVip,
  vipName,
  vipTitle,
}: Props) {
  const [state, formAction] = useActionState(updateProfileAction, initial)
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }

  return (
    <form
      onSubmit={onSubmit}
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
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </Field>
        <Field label={isVip ? '公司（留空用嘉宾默认 title）' : '公司'}>
          <input
            name="company"
            defaultValue={defaultCompany ?? ''}
            placeholder="公司"
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="联系方式 LinkedIn / 邮箱 / 微信">
            <input
              name="contact_handle"
              defaultValue={defaultContactHandle ?? ''}
              placeholder="例如 linkedin.com/in/your-id"
              className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </Field>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-700">
        <input
          type="checkbox"
          name="show_contact"
          defaultChecked={defaultShowContact}
          className="size-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400"
        />
        新发帖默认显示我的联系方式
      </label>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {state.ok ? '已保存' : ' '}
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:bg-zinc-400"
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
