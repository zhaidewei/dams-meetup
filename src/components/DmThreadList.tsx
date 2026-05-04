import Link from 'next/link'
import { displayName, displayMeta } from '@/lib/display'
import type { DmThreadSummary } from '@/lib/queries/dm'
import { Avatar } from './Avatar'
import { DeleteThreadButton } from './DeleteThreadButton'

type Props = {
  threads: DmThreadSummary[]
  viewerCanDm: boolean
  viewerId: string
}

export function DmThreadList({ threads, viewerCanDm, viewerId }: Props) {
  if (!viewerCanDm) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-500">
        到「我」设置昵称后才能开启私信
      </div>
    )
  }
  if (threads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-500">
        还没有私信。在时间线点别人帖子的「私信」按钮可发起会话。
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {threads.map((t) => (
        <ThreadRow key={t.thread_id} thread={t} viewerId={viewerId} />
      ))}
    </div>
  )
}

function ThreadRow({ thread, viewerId }: { thread: DmThreadSummary; viewerId: string }) {
  const name = displayName(thread.other)
  const meta = displayMeta(thread.other)
  const last = thread.last_message
  const lastSenderIsMe = last?.sender_id === viewerId
  const previewPrefix = lastSenderIsMe ? '我：' : ''
  const preview = last?.body ?? '（还没消息）'
  return (
    // relative 容器：Link 占满整行，删除按钮 absolute 浮在右侧；按钮不是 Link 的
    // 子节点，浏览器 hit test 会把按钮区域路由到按钮本身，不会触发 Link 跳转。
    <div className="relative">
      <Link
        href={`/me/dm/${thread.thread_id}`}
        className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 pr-12 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
      >
        <Avatar seed={thread.other.id} user={thread.other} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold text-zinc-900">{name}</span>
            {meta && <span className="truncate text-zinc-500">· {meta}</span>}
            {thread.other.is_vip && (
              <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-800">
                嘉宾
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-600">
            {previewPrefix}
            {preview}
          </p>
        </div>
        {thread.unread_count > 0 && (
          <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-medium text-white">
            {thread.unread_count > 99 ? '99+' : thread.unread_count}
          </span>
        )}
      </Link>
      <DeleteThreadButton
        threadId={thread.thread_id}
        className="absolute right-2 top-1/2 -translate-y-1/2"
      />
    </div>
  )
}
