'use client'

import { useId, useState, type FormEvent } from 'react'
import { MAX_DISCUSSION_BODY } from '@/lib/meetup15/discussion'

export const discussionButton = 'min-h-11 rounded border border-zinc-300 px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-dams-blue disabled:opacity-50'
export const discussionInput = 'min-h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-dams-blue md:text-sm'

export function DiscussionComposer({ label, action, pending, initialBody = '', initialTags, featured = false, accent = false, maxLength = MAX_DISCUSSION_BODY, placeholder, onCancel, onSubmit }: {
  label: string
  action: string
  pending: boolean
  initialBody?: string
  initialTags?: string[]
  featured?: boolean
  accent?: boolean
  maxLength?: number
  placeholder?: string
  onCancel?: () => void
  onSubmit: (body: string, tags: string) => Promise<boolean>
}) {
  const [body, setBody] = useState(initialBody)
  const bodyId = useId()
  const length = [...body.trim()].length

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !length || length > maxLength) return
    const form = event.currentTarget
    const tags = String(new FormData(form).get('tags') ?? '')
    if (await onSubmit(body, tags)) {
      setBody('')
      form.reset()
    }
  }

  return (
    <form className="space-y-2" onSubmit={submit}>
      <label htmlFor={bodyId} className={featured ? 'block font-semibold text-slate-900' : 'block text-sm'}>{label}</label>
      <textarea id={bodyId} rows={3} placeholder={placeholder}
        className={featured ? 'w-full min-w-0 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-dams-blue' : discussionInput} value={body} maxLength={maxLength * 2} aria-describedby={bodyId + "-length"}
          onChange={(event) => setBody(event.target.value)} enterKeyHint="done" required />
      <div id={bodyId + "-length"} className="text-xs text-zinc-600">{length}/{maxLength} 字{maxLength !== MAX_DISCUSSION_BODY && "（含标点）"}</div>
      {initialTags && (
        <label className="block text-sm">
          标签（空格分隔，最多 5 个）
          <input name="tags" maxLength={160} className={discussionInput} defaultValue={initialTags.join(' ')} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={featured
          ? `min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${accent ? 'bg-dams-orange text-dams-ink hover:bg-dams-orange-hover' : 'bg-dams-blue text-white hover:bg-dams-hover'}`
          : discussionButton} disabled={pending || !length || length > maxLength}>
          {pending ? "正在提交…" : action}
        </button>
        {onCancel && <button className={discussionButton} type="button" onClick={onCancel}>取消</button>}
      </div>
    </form>
  )
}
