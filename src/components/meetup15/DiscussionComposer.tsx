'use client'

import { useId, useState, type FormEvent } from 'react'
import { MAX_DISCUSSION_BODY } from '@/lib/meetup15/discussion'
import { MemberAvatar } from './MemberAvatar'

export const discussionButton = 'min-h-11 rounded border border-zinc-300 px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-dams-blue disabled:opacity-50'
const textButton = 'min-h-11 rounded-full px-3 text-sm hover:bg-dams-wash focus-visible:outline-2 focus-visible:outline-dams-blue disabled:opacity-50'
export const discussionInput = 'min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-dams-blue md:text-sm'

export function DiscussionComposer({ label, action, pending, initialBody = '', featured = false, accent = false, compact = false, autoFocus = false, maxLength = MAX_DISCUSSION_BODY, placeholder, author, onCancel, onSubmit }: {
  label: string
  action: string
  pending: boolean
  initialBody?: string
  featured?: boolean
  accent?: boolean
  compact?: boolean
  autoFocus?: boolean
  maxLength?: number
  placeholder?: string
  author?: { id: string; name: string }
  onCancel?: () => void
  onSubmit: (body: string) => Promise<boolean>
}) {
  const [body, setBody] = useState(initialBody)
  const bodyId = useId()
  const length = [...body.trim()].length
  const inline = Boolean(author) || compact

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !length || length > maxLength) return
    if (await onSubmit(body)) setBody('')
  }

  const lengthId = bodyId + '-length'
  const count = <span id={lengthId} className={length > maxLength ? 'text-xs tabular-nums text-dams-orange-strong' : 'text-xs tabular-nums text-zinc-600'}>
    {length}/{maxLength} 字{maxLength !== MAX_DISCUSSION_BODY && '（含标点）'}
  </span>
  const buttonClass = featured
    ? `min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${accent ? 'bg-dams-orange text-dams-ink hover:bg-dams-orange-hover' : 'bg-dams-blue text-white hover:bg-dams-hover'}`
    : compact ? `${textButton} font-semibold text-dams-blue` : discussionButton
  const bodyClass = inline
    ? 'block min-h-11 max-h-60 w-full min-w-0 resize-y rounded-lg bg-white px-2 py-2.5 text-base placeholder:text-slate-500 focus-visible:bg-dams-wash focus-visible:outline-2 focus-visible:outline-dams-blue supports-[field-sizing:content]:field-sizing-content supports-[field-sizing:content]:resize-none'
    : featured ? 'w-full min-w-0 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-dams-blue' : discussionInput

  return (
    <form className={author ? 'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3' : ''} onSubmit={submit}>
      {author && <MemberAvatar id={author.id} name={author.name} className="mt-1 size-9 sm:size-10" />}
      <div className="min-w-0 space-y-2">
        <label htmlFor={bodyId} className={inline ? 'sr-only' : featured ? 'block font-semibold text-slate-900' : 'block text-sm'}>{label}</label>
        <textarea id={bodyId} rows={inline ? 1 : 3} placeholder={placeholder} autoFocus={autoFocus}
          className={bodyClass} value={body} maxLength={maxLength * 2} aria-describedby={lengthId}
          aria-invalid={length > maxLength} onChange={(event) => setBody(event.target.value)} enterKeyHint="done" required />
        {!inline && <div>{count}</div>}
        <div className={inline ? 'flex flex-wrap items-center justify-end gap-x-2 border-t border-dams-line pt-1' : 'flex flex-wrap gap-2'}>
          {inline && count}
          {compact && onCancel && <button className={`${textButton} text-slate-600`} type="button" onClick={onCancel}>取消</button>}
          <button className={author ? 'min-h-11 rounded-full bg-dams-blue px-5 text-sm font-semibold text-white hover:bg-dams-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dams-blue disabled:bg-dams-wash disabled:text-slate-600' : buttonClass}
            disabled={pending || !length || length > maxLength}>
            {pending ? "正在提交…" : action}
          </button>
          {!compact && onCancel && <button className={discussionButton} type="button" onClick={onCancel}>取消</button>}
        </div>
      </div>
    </form>
  )
}
