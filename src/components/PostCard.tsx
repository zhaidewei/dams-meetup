import type { FeedPost } from '@/lib/queries/posts'
import { displayName, displayMeta } from '@/lib/display'
import { LikeButton } from './LikeButton'
import { PollCard } from './PollCard'
import { ReplySection } from './ReplySection'

type Props = { post: FeedPost }

export function PostCard({ post }: Props) {
  const author = post.author
  const name = displayName(author)
  const meta = displayMeta(author)
  const isPoll = post.type === 'poll'

  return (
    <article id={`post-${post.id}`} className="scroll-mt-20 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="mb-2 flex items-baseline gap-2 text-sm">
        <span className="font-semibold text-zinc-900">{name}</span>
        {meta && <span className="text-zinc-500">· {meta}</span>}
        {author.is_vip && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            嘉宾
          </span>
        )}
        {isPoll && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
            投票
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-400">{formatTime(post.created_at)}</span>
      </header>

      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
        {post.body}
      </p>

      {isPoll && post.poll_options && (
        <PollCard
          postId={post.id}
          options={post.poll_options}
          multi={post.poll_multi ?? false}
          hideResults={post.poll_hide_results ?? false}
          closed={isPollClosed(post.poll_deadline)}
          totalVotes={post.poll_total_votes ?? 0}
          optionCounts={post.poll_option_counts ?? {}}
          myVoteOptions={post.poll_my_vote_options ?? []}
        />
      )}

      {!isPoll && post.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {!isPoll && post.show_contact && author.contact_handle && (
        <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          联系方式：<span className="text-zinc-800">{author.contact_handle}</span>
        </p>
      )}

      <div className="mt-3 flex items-center gap-1">
        <LikeButton postId={post.id} count={post.like_count} liked={post.liked_by_me} />
      </div>

      <ReplySection postId={post.id} count={post.reply_count} replies={post.replies} />
    </article>
  )
}

function isPollClosed(deadline: string | null): boolean {
  if (!deadline) return false
  return Date.now() >= new Date(deadline).getTime()
}

function formatTime(iso: string): string {
  const t = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - t.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return t.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
