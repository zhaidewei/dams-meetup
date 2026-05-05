'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, Check, Copy, Link2, Send, UserCircle2, X } from 'lucide-react'
import { Avatar } from './Avatar'
import { displayName, displayMeta } from '@/lib/display'
import { startThreadAction } from '@/lib/actions/dm'

// UserCard 需要的字段。所有出现 trigger 的地方（PostCard / ReplyRow /
// DmThreadView）都要 select 出来。
export type UserCardUser = {
  id: string
  nickname: string | null
  company: string | null
  contact_handle: string | null
  show_contact: boolean
  is_vip: boolean
  vip_name: string | null
  vip_title: string | null
}

type TriggerProps = {
  user: UserCardUser | null
  viewerCanDm: boolean
  isMine: boolean
  // 头像 + 名字 等触发体内容由父组件传入。
  children: React.ReactNode
  // 应用到外层 button / span 的样式（保持 flex / gap / items-center 等布局）。
  className?: string
}

// 包裹 children 成可点击触发体。匿名用户（无昵称且非嘉宾）→ 不可点击，
// 直接渲染原 children。这样调用点不需要写条件逻辑。
export function UserCardTrigger({ user, viewerCanDm, isMine, children, className }: TriggerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isAnon = !user || (!user.nickname && !user.is_vip)

  if (!user || isAnon) {
    return <span className={className}>{children}</span>
  }

  function open(e: React.MouseEvent) {
    // 嵌在 <Link> / 父级有 onClick 的情况下需要阻断
    e.preventDefault()
    e.stopPropagation()
    dialogRef.current?.showModal()
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={(className ?? '') + ' cursor-pointer rounded-md hover:bg-zinc-50'}
        aria-label={`查看 ${displayName(user)} 的资料`}
      >
        {children}
      </button>
      <UserCardDialog
        dialogRef={dialogRef}
        user={user}
        viewerCanDm={viewerCanDm}
        isMine={isMine}
      />
    </>
  )
}

function UserCardDialog({
  dialogRef,
  user,
  viewerCanDm,
  isMine,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>
  user: UserCardUser
  viewerCanDm: boolean
  isMine: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = displayName(user)
  const meta = displayMeta(user)
  // 「资料中是否公开 contact_handle」= user.show_contact 且填了 handle。
  const showContact = user.show_contact && !!user.contact_handle
  const canDm = viewerCanDm && !isMine

  function close() {
    dialogRef.current?.close()
  }

  async function onDm() {
    setError(null)
    setPending(true)
    try {
      const res = await startThreadAction(user.id)
      if (res.error || !res.threadId) {
        setError(res.error ?? '打开私信失败')
        return
      }
      close()
      router.push(`/me/dm/${res.threadId}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        // 点 backdrop（target === dialog 自身）时关闭；点内部 div 不关闭
        if (e.target === e.currentTarget) close()
      }}
      className="rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
    >
      <div className="w-[min(92vw,360px)] rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <Avatar seed={user.id} user={user} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="truncate text-base font-semibold text-zinc-900">{name}</span>
              {user.is_vip && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  嘉宾
                </span>
              )}
            </div>
            {meta && <p className="mt-0.5 truncate text-sm text-zinc-600">{meta}</p>}
            {isMine && <p className="mt-1 text-xs text-zinc-400">（这是你自己）</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {showContact ? (
          <ContactPill text={user.contact_handle!} />
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-500">
            该用户未公开联系方式
          </p>
        )}

        {canDm && (
          <button
            type="button"
            onClick={onDm}
            disabled={pending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-zinc-400"
          >
            <Send className="size-4" aria-hidden />
            {pending ? '打开中…' : '发私信'}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </dialog>
  )
}

function ContactPill({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const kind = contactKind(text)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard 被浏览器拦截：不致命
    }
  }
  const iconClass = 'size-3.5 shrink-0 text-zinc-500 group-hover:text-blue-600'
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? '已复制' : '点击复制'}
      className="group mt-4 inline-flex w-full max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
    >
      {kind === 'url' && <Link2 className={iconClass} aria-hidden />}
      {kind === 'email' && <AtSign className={iconClass} aria-hidden />}
      {kind === 'other' && <UserCircle2 className={iconClass} aria-hidden />}
      <span className="truncate text-left font-medium text-zinc-800">{text}</span>
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-zinc-500 group-hover:text-blue-700">
        {copied ? (
          <>
            <Check className="size-3" aria-hidden />
            已复制
          </>
        ) : (
          <>
            <Copy className="size-3" aria-hidden />
            复制
          </>
        )}
      </span>
    </button>
  )
}

function contactKind(s: string): 'url' | 'email' | 'other' {
  if (/^https?:\/\//i.test(s)) return 'url'
  if (/@.+\./.test(s)) return 'email'
  return 'other'
}
