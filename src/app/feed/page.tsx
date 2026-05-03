import { redirect } from 'next/navigation'
import { getCurrentUser, touchLastSeen } from '@/lib/identity'
import { Header } from '@/components/Header'
import { PostComposer } from '@/components/PostComposer'
import { PostCard } from '@/components/PostCard'
import { SectionTabs } from '@/components/SectionTabs'
import { FeedRealtime } from '@/components/FeedRealtime'
import { fetchFeed } from '@/lib/queries/posts'
import { DEFAULT_SECTION, isSectionId } from '@/lib/sections'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ section?: string }>

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const sp = await searchParams
  if (sp.section !== undefined && !isSectionId(sp.section)) {
    redirect(`/feed?section=${DEFAULT_SECTION}`)
  }
  const section = isSectionId(sp.section) ? sp.section : DEFAULT_SECTION

  // Mark this user as recently active (used by /screen online count).
  // Fire-and-forget; don't await on the render path.
  void touchLastSeen(user.id)

  const posts = await fetchFeed(user.id, { section })

  return (
    <>
      <Header active="feed" />
      <FeedRealtime />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <SectionTabs active={section} />
        <div className="mt-4 space-y-4">
          <PostComposer
            defaultNickname={user.nickname}
            defaultCompany={user.company}
            defaultContactHandle={user.contact_handle}
            defaultShowContact={user.show_contact}
            isVip={user.is_vip}
            vipName={user.vip_name}
            vipTitle={user.vip_title}
            section={section}
          />

          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
              这个板块还没有人发帖。第一条由你来。
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} viewerId={user.id} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
