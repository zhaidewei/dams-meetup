import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sparkles, ChevronRight } from 'lucide-react'
import { getCurrentUser, touchLastSeenMe } from '@/lib/identity'
import { Header } from '@/components/Header'
import { MeIdentityBar } from '@/components/MeIdentityBar'
import { PostCard } from '@/components/PostCard'
import { ProfileForm } from '@/components/ProfileForm'
import { RecoveryLink } from '@/components/RecoveryLink'
import { LogoutButton } from '@/components/LogoutButton'
import { DmThreadList } from '@/components/DmThreadList'
import { DmRealtime } from '@/components/DmRealtime'
import { MeRealtime } from '@/components/MeRealtime'
import { fetchFeed } from '@/lib/queries/posts'
import { fetchRepliesToMe, fetchMentionsOfMe, type ReplyToMe, type MentionOfMe } from '@/lib/queries/me'
import { listMyThreads } from '@/lib/queries/dm'
import { fetchUnreadMe } from '@/lib/queries/unread'
import { displayName, displayMeta } from '@/lib/display'
import { isNonAnon } from '@/lib/dm'
import { DEFAULT_SECTION, isSectionId } from '@/lib/sections'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const [myPosts, repliesToMe, mentionsOfMe, threads, unreadMe] = await Promise.all([
    fetchFeed(user.id, { authorId: user.id, limit: 50 }),
    fetchRepliesToMe(user.id),
    fetchMentionsOfMe(user.id),
    listMyThreads(user.id),
    fetchUnreadMe(user),
  ])
  const viewerCanDm = isNonAnon(user)

  // 进 /me 即把"我"tab 红点清零（下次刷新时回复 / 提及未读 → 0）。
  // Fire-and-forget — 失败不影响渲染。
  void touchLastSeenMe(user.id)

  return (
    <>
      <Header active="me" unreadMeCount={unreadMe.total} />
      <DmRealtime viewerId={user.id} />
      <MeRealtime viewerId={user.id} />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="space-y-4">
          {/*
            issue #18 D — 高频 actionable 在上，低频 setup 折叠成「设置」。
            排序按 attention：
              1. 顶部超薄身份条（看自己一眼，编辑跳到底部「设置」）
              2. 私信（双向、强 actionable）
              3. 有人想找你（AI 撮合提及）
              4. 收到的回复
              5. 我发的帖子
              6. 设置（profile + recovery + 登出）— <details> 默认收起
          */}

          <MeIdentityBar user={user} />

          <Section
            title="私信"
            count={threads.length}
            unreadBadge={unreadMe.dm > 0 ? <UnreadChip n={unreadMe.dm} /> : null}
          >
            <DmThreadList threads={threads} viewerCanDm={viewerCanDm} viewerId={user.id} />
          </Section>

          <Section
            title="有人想找你"
            count={mentionsOfMe.length}
            defaultOpen={mentionsOfMe.length > 0}
          >
            {mentionsOfMe.length === 0 ? (
              <Empty text="还没有人通过 AI 撮合点到你" />
            ) : (
              <FoldableList
                items={mentionsOfMe}
                getKey={(m) => m.reply_id}
                render={(m) => <MentionRow mention={m} />}
                gapClass="space-y-2"
              />
            )}
          </Section>

          <Section title="收到的回复" count={repliesToMe.length} defaultOpen={repliesToMe.length > 0}>
            {repliesToMe.length === 0 ? (
              <Empty text="还没有人回复你的帖子" />
            ) : (
              <FoldableList
                items={repliesToMe}
                getKey={(r) => r.id}
                render={(r) => <ReplyToMeRow reply={r} />}
                gapClass="space-y-2"
              />
            )}
          </Section>

          <Section title="我发的帖子" count={myPosts.length} defaultOpen={false}>
            {myPosts.length === 0 ? (
              <Empty text="你还没发过帖子。去 时间线 发第一条。" />
            ) : (
              <FoldableList
                items={myPosts}
                getKey={(p) => p.id}
                render={(post) => (
                  <PostCard post={post} viewerId={user.id} viewerCanDm={viewerCanDm} />
                )}
                gapClass="space-y-3"
                limit={3}
              />
            )}
          </Section>

          <details
            id="settings"
            className="group scroll-mt-20 rounded-2xl border border-zinc-200 bg-white shadow-sm open:bg-zinc-50"
          >
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">
              <span className="inline-flex items-center gap-1.5">
                <ChevronRight
                  className="size-3.5 text-zinc-400 transition-transform group-open:rotate-90"
                  aria-hidden
                />
                设置
              </span>
            </summary>
            <div className="space-y-3 border-t border-zinc-200 p-4">
              <ProfileForm
                defaultNickname={user.nickname}
                defaultCompany={user.company}
                defaultContactHandle={user.contact_handle}
                defaultShowContact={user.show_contact}
                isVip={user.is_vip}
                vipName={user.vip_name}
                vipTitle={user.vip_title}
              />
              <RecoveryLink uid={user.id} token={user.recovery_token} />
              <LogoutButton />
            </div>
          </details>
        </div>
      </main>
    </>
  )
}

function Section({
  title,
  count,
  unreadBadge,
  defaultOpen = true,
  children,
}: {
  title: string
  count?: number
  unreadBadge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-1 py-1.5 text-sm font-semibold text-zinc-900 hover:text-zinc-700">
        <ChevronRight
          className="size-3.5 text-zinc-400 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <span>{title}</span>
        {typeof count === 'number' && (
          <span className="text-xs font-normal text-zinc-500">· {count}</span>
        )}
        {unreadBadge}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

function UnreadChip({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-medium leading-tight text-white">
      未读 {n > 99 ? '99+' : n}
    </span>
  )
}

// 列表前 N 条直出，剩下塞进折叠的 <details>。<details> 内嵌 <details> 会让外层
// 的 group-open chevron 同时指向自己；这里里层用一个独立 ChevronDown 文字来避免
// 选择器冲突。
function FoldableList<T>({
  items,
  getKey,
  render,
  gapClass,
  limit = 5,
}: {
  items: T[]
  getKey: (item: T) => string | number
  render: (item: T) => React.ReactNode
  gapClass: string
  limit?: number
}) {
  const head = items.slice(0, limit)
  const tail = items.slice(limit)
  return (
    <>
      <div className={gapClass}>
        {head.map((item) => (
          <div key={getKey(item)}>{render(item)}</div>
        ))}
      </div>
      {tail.length > 0 && (
        <details className="mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-1 py-1 text-xs text-indigo-600 hover:text-indigo-700">
            <span className="underline underline-offset-2">查看其余 {tail.length} 条</span>
          </summary>
          <div className={`mt-2 ${gapClass}`}>
            {tail.map((item) => (
              <div key={getKey(item)}>{render(item)}</div>
            ))}
          </div>
        </details>
      )}
    </>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
      {text}
    </div>
  )
}

function MentionRow({ mention }: { mention: MentionOfMe }) {
  return (
    <Link
      href={`/feed?section=${postSectionParam(mention.post_section)}#post-${mention.post_id}`}
      className="block rounded-2xl border border-indigo-200 bg-indigo-50 p-3 shadow-sm transition-colors hover:border-indigo-300"
    >
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <Sparkles className="size-3.5 self-center text-indigo-700" aria-hidden />
        <span className="font-medium text-indigo-900">有人对这条帖子感兴趣，可能想找你</span>
        <span className="ml-auto text-indigo-700">{formatTime(mention.reply_created_at)}</span>
      </div>
      <p className="truncate rounded-md bg-white/60 px-2 py-1 text-xs text-zinc-700">
        {mention.post_body}
      </p>
    </Link>
  )
}

function ReplyToMeRow({ reply }: { reply: ReplyToMe }) {
  const a = reply.replier
  const name = displayName(a)
  const meta = displayMeta(a)
  return (
    <Link
      href={`/feed?section=${postSectionParam(reply.post_section)}#post-${reply.post_id}`}
      className="block rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm transition-colors hover:border-zinc-300"
    >
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <span className="font-medium text-zinc-700">{name}</span>
        {meta && <span className="text-zinc-500">· {meta}</span>}
        {a.is_vip && (
          <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-800">
            嘉宾
          </span>
        )}
        <span className="ml-auto text-zinc-400">{formatTime(reply.created_at)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-zinc-800">{reply.body}</p>
      <p className="mt-2 truncate rounded-md bg-zinc-50 px-2 py-1 text-xs text-zinc-500">
        回复你的帖子：{reply.post_body}
      </p>
    </Link>
  )
}

// 把 post.section 标准化成 /feed?section= 的有效值。null / 非法值兜底到 DEFAULT_SECTION，
// 避免 /feed 把无 section 的链接默认跳到当前 LIVE 板块（用户实际想看的那条帖会被 section
// 过滤掉，体验上就是「点了跳过去找不到」）。
function postSectionParam(section: string | null): string {
  return isSectionId(section) ? section : DEFAULT_SECTION
}

function formatTime(iso: string): string {
  const t = new Date(iso)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - t.getTime()) / 1000)
  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return t.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
