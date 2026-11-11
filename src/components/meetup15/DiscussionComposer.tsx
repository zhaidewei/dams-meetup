'use client'

import { useId, useState, type FormEvent } from 'react'
import { MAX_DISCUSSION_BODY } from '@/lib/meetup15/discussion'

export const discussionButton = 'min-h-11 rounded border border-zinc-300 px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-dams-blue disabled:opacity-50'
export const discussionInput = 'w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm'

export function DiscussionComposer({ label, action, pending, initialBody = '', initialTags, featured = false, placeholder, onCancel, onSubmit }: {
  label: string
  action: string
  pending: boolean
  initialBody?: string
  initialTags?: string[]
  featured?: boolean
  placeholder?: string
  onCancel?: () => void
  onSubmit: (body: string, tags: string) => Promise<boolean>
}) {
  const [body, setBody] = useState(initialBody)
  const bodyId = useId()
  const length = [...body.trim()].length

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
        className={featured ? 'w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-dams-blue' : discussionInput} value={body} maxLength={MAX_DISCUSSION_BODY * 2}
          onChange={(event) => setBody(event.target.value)} required />
      <div className="text-xs text-zinc-600">{length}/{MAX_DISCUSSION_BODY} 字</div>
      {initialTags && (
        <label className="block text-sm">
          标签（空格分隔，最多 5 个）
          <input name="tags" maxLength={160} className={discussionInput} defaultValue={initialTags.join(' ')} />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={featured ? 'min-h-11 rounded-full bg-dams-blue px-5 text-sm font-semibold text-white hover:bg-dams-hover disabled:opacity-50' : discussionButton} disabled={pending || !length || length > MAX_DISCUSSION_BODY}>
          {action}
        </button>
        {onCancel && <button className={discussionButton} type="button" onClick={onCancel}>取消</button>}
      </div>
    </form>
  )
}
