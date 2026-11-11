'use client'

import { startTransition, useOptimistic, useState } from 'react'
import { DISCUSSION_EMOJIS, type DiscussionItem, type MemberCommand, type DiscussionEmoji, type DiscussionReaction } from '@/lib/meetup15/discussion'

const empty: DiscussionReaction[] = []
const reactionButton = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dams-blue'

export function DiscussionReactions({ item, pending, submit }: {
  item: DiscussionItem
  pending: boolean
  submit: (command: MemberCommand) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState<DiscussionEmoji | null>(null)
  const [reactions, applyReaction] = useOptimistic(item.reactions ?? empty,
    (current, { emoji, reacted }: { emoji: DiscussionEmoji; reacted: boolean }) => {
      const existing = current.find(reaction => reaction.emoji === emoji)
      if (Boolean(existing?.reacted) === reacted) return current
      const count = (existing?.count ?? 0) + (reacted ? 1 : -1)
      const rest = current.filter(reaction => reaction.emoji !== emoji)
      return count > 0 ? [...rest, { emoji, count, reacted }] : rest
    })

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={item.kind === 'post' ? '帖子表情' : '回复表情'}>
      <button type="button" className={reactionButton + ' text-slate-600 hover:bg-dams-wash aria-expanded:bg-dams-wash aria-expanded:text-dams-hover'}
        aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '收起表情' : '添加表情'}
      </button>
      {DISCUSSION_EMOJIS.map(([emoji, label]) => {
        const reaction = reactions.find(entry => entry.emoji === emoji)
        if (!open && !reaction && focused !== emoji) return null
        return (
          <button key={emoji} type="button"
            className={reactionButton + ' hover:bg-dams-wash aria-pressed:bg-dams-selection aria-pressed:font-semibold aria-pressed:text-dams-hover aria-disabled:opacity-50' + (reaction ? ' bg-dams-wash' : '')}
            aria-label={label + '，' + (reaction?.count ?? 0) + ' 人'}
            aria-pressed={reaction?.reacted ?? false} aria-disabled={pending}
            onFocus={() => setFocused(emoji)} onBlur={() => setFocused(null)}
            onClick={() => {
              if (pending) return
              const reacted = !reaction?.reacted
              const completion = submit({ action: 'reaction', id: item.id, emoji, reacted })
              startTransition(async () => {
                applyReaction({ emoji, reacted })
                await completion
              })
            }}>
            <span aria-hidden="true" className="text-base">{emoji}</span>
            {reaction && <span aria-hidden="true">{reaction.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
