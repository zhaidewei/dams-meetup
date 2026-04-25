import type { FeedPost } from '@/lib/queries/posts'
import { LikeButton } from './LikeButton'
import { ReplySection } from './ReplySection'

type Props = { post: FeedPost }

export function PostCard({ post }: Props) {
  const author = post.author
  const displayName = author.is_vip
    ? author.vip_name ?? '嘉宾'
    : author.nickname ?? '匿名'
  const displayMeta = author.is_vip ? author.vip_title : author.company

  return (
    <article id={`post-${post.id}`} className="scroll-mt-20 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="mb-2 flex items-baseline gap-2 text-sm">
        <span className="font-semibold text-zinc-900">{displayName}</span>
        {displayMeta && <span className="text-zinc-500">· {displayMeta}</span>}
        {author.is_vip && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            嘉宾
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-400">{formatTime(post.created_at)}</span>
      </header>

      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
        {post.body}
      </p>

      {post.tags.length > 0 && (
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

      {post.show_contact && author.contact_handle && (
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
