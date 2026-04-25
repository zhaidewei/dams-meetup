import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { ProfileForm } from '@/components/ProfileForm'
import { RecoveryLink } from '@/components/RecoveryLink'
import { fetchFeed } from '@/lib/queries/posts'
import { fetchRepliesToMe, type ReplyToMe } from '@/lib/queries/me'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const [myPosts, repliesToMe] = await Promise.all([
    fetchFeed(user.id, { authorId: user.id, limit: 50 }),
    fetchRepliesToMe(user.id),
  ])

  return (
    <>
      <Header active="me" />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="space-y-4">
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

          <Section title={`收到的回复 (${repliesToMe.length})`}>
            {repliesToMe.length === 0 ? (
              <Empty text="还没有人回复你的帖子" />
            ) : (
              <div className="space-y-2">
                {repliesToMe.map((r) => (
                  <ReplyToMeRow key={r.id} reply={r} />
                ))}
              </div>
            )}
          </Section>

          <Section title={`我发的帖子 (${myPosts.length})`}>
            {myPosts.length === 0 ? (
              <Empty text="你还没发过帖子。去 时间线 发第一条。" />
            ) : (
              <div className="space-y-3">
                {myPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </Section>
        </div>
      </main>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
      {text}
    </div>
  )
}

function ReplyToMeRow({ reply }: { reply: ReplyToMe }) {
  const a = reply.replier
  const name = a.is_vip ? a.vip_name ?? '嘉宾' : a.nickname ?? '匿名'
  const meta = a.is_vip ? a.vip_title : a.company
  return (
    <Link
      href={`/feed#post-${reply.post_id}`}
      className="block rounded-xl border border-zinc-200 bg-white p-3 shadow-sm hover:border-zinc-300"
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

function formatTime(iso: string): string {
  const t = new Date(iso)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - t.getTime()) / 1000)
  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`
  return t.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
