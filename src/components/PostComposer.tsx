'use client'

import { useActionState, useState, useTransition } from 'react'
import { createPostAction, type PostFormState } from '@/lib/actions/posts'
import { POST_MAX_CHARS, MATCH_INTENT_MAX_CHARS } from '@/lib/constants'
import type { SectionId } from '@/lib/sections'
import { PollComposer } from './PollComposer'

const initial: PostFormState = { error: null }

type Props = {
  defaultNickname: string | null
  defaultCompany: string | null
  defaultContactHandle: string | null
  defaultShowContact: boolean
  isVip: boolean
  section: SectionId
}

export function PostComposer({
  defaultNickname,
  defaultCompany,
  defaultContactHandle,
  defaultShowContact,
  isVip,
  section,
}: Props) {
  const [state, formAction] = useActionState(createPostAction, initial)
  const [, startTransition] = useTransition()
  const [body, setBody] = useState('')
  const [identityOpen, setIdentityOpen] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)
  const [matchIntent, setMatchIntent] = useState('')
  const [mode, setMode] = useState<'text' | 'poll'>('text')

  if (mode === 'poll') {
    return <PollComposer section={section} onCancel={() => setMode('text')} />
  }

  const remaining = POST_MAX_CHARS - body.length

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => {
      formAction(fd)
    })
    if (!state.error) {
      // Optimistic clear; server will revalidate the feed
      setBody('')
      setMatchIntent('')
      setMatchOpen(false)
    }
  }

  const matchRemaining = MATCH_INTENT_MAX_CHARS - matchIntent.length

  const displayName = defaultNickname || '匿名'
  const displayCompany = defaultCompany ? ` · ${defaultCompany}` : ''

  return (
    <form
      onSubmit={onSubmit}
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
        value={body}
        onChange={(e) => setBody(e.target.value)}
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
          <span className="font-medium text-zinc-700">{displayName}</span>
          <span>{displayCompany}</span>
          <span className="text-zinc-400">{identityOpen ? '收起' : '编辑身份'}</span>
        </button>
        <span className={remaining < 0 ? 'text-red-500' : ''}>{remaining}</span>
      </div>

      {identityOpen && (
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-zinc-50 p-3 sm:grid-cols-2">
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
      )}

      <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
        <button
          type="button"
          onClick={() => setMatchOpen((v) => !v)}
          className="flex w-full items-center justify-between text-xs"
        >
          <span className="flex items-center gap-1.5 text-sky-900">
            <span aria-hidden>🤖</span>
            <span className="font-medium">委托 AI 寻找匹配（私下，仅你可见）</span>
          </span>
          <span className="text-sky-700">{matchOpen ? '收起' : '展开'}</span>
        </button>
        {matchOpen && (
          <div className="space-y-1.5">
            <textarea
              name="match_intent"
              value={matchIntent}
              onChange={(e) => setMatchIntent(e.target.value)}
              maxLength={MATCH_INTENT_MAX_CHARS}
              placeholder="比如：想找 Booking 的同学聊内推 / 想找会 dbt 的人 / 想找做 PM 的同行聊聊"
              rows={3}
              className="w-full resize-none rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-zinc-400 focus:border-sky-400 focus:outline-none"
            />
            <div className="flex items-center justify-between text-[11px] text-sky-700">
              <span>这条不进时间线。AI 会按你的描述帮你找人，结果以回帖形式仅你可见。</span>
              <span className={matchRemaining < 0 ? 'text-red-600' : ''}>{matchRemaining}</span>
            </div>
          </div>
        )}
      </div>


      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            name="show_contact"
            defaultChecked={defaultShowContact}
            className="size-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
          />
          这条帖子里显示我的联系方式
        </label>
        <button
          type="submit"
          disabled={remaining < 0 || body.trim().length === 0}
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
        >
          发帖
        </button>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
