'use client'

import { startTransition, useOptimistic, useState } from 'react'
import { REPLY_EMOJIS, type DiscussionItem, type MemberCommand, type ReplyEmoji, type ReplyReaction } from '@/lib/meetup15/discussion'
import { discussionButton } from './DiscussionComposer'

const empty: ReplyReaction[] = []
const reactionButton = discussionButton + ' min-h-11 min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2'

export function ReplyReactions({ item, pending, submit }: {
  item: DiscussionItem
  pending: boolean
  submit: (command: MemberCommand) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState<ReplyEmoji | null>(null)
  const [reactions, applyReaction] = useOptimistic(item.reactions ?? empty,
    (current, { emoji, reacted }: { emoji: ReplyEmoji; reacted: boolean }) => {
      const existing = current.find(reaction => reaction.emoji === emoji)
      if (Boolean(existing?.reacted) === reacted) return current
      const count = (existing?.count ?? 0) + (reacted ? 1 : -1)
      const rest = current.filter(reaction => reaction.emoji !== emoji)
      return count > 0 ? [...rest, { emoji, count, reacted }] : rest
    })

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="回复表情">
      <button type="button" className={discussionButton + ' min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2'}
        aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '收起表情' : '添加表情'}
      </button>
      {REPLY_EMOJIS.map(([emoji, label]) => {
        const reaction = reactions.find(entry => entry.emoji === emoji)
        if (!open && !reaction && focused !== emoji) return null
        return (
          <button key={emoji} type="button"
            className={reactionButton + ' aria-pressed:border-sky-700 aria-pressed:bg-sky-50 aria-pressed:text-sky-900 aria-disabled:opacity-50'}
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
            {emoji}{reaction ? ' ' + reaction.count : ''}
          </button>
        )
      })}
    </div>
  )
}
