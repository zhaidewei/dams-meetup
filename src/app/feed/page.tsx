import { redirect } from 'next/navigation'
import { getCurrentUser, touchLastSeen } from '@/lib/identity'
import { Header } from '@/components/Header'
import { EventHero } from '@/components/EventHero'
import { PostComposer } from '@/components/PostComposer'
import { QuestionComposer } from '@/components/QuestionComposer'
import { PostCard } from '@/components/PostCard'
import { SectionTabs } from '@/components/SectionTabs'
import { SectionContextBar } from '@/components/SectionContextBar'
import { OnboardingBanner } from '@/components/OnboardingBanner'
import { FeedRealtime } from '@/components/FeedRealtime'
import { DmRealtime } from '@/components/DmRealtime'
import { fetchFeed } from '@/lib/queries/posts'
import { fetchUnreadMe } from '@/lib/queries/unread'
import { getCurrentSection, getScreenModeState } from '@/lib/queries/event-state'
import { isNonAnon } from '@/lib/dm'
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

  // 「当前板块」= 主办方覆写 → 议程时间表 → null（活动外 / 空档）。
  // 用于 (a) /feed 默认跳当前板块；(b) SectionTabs LIVE 标。
  const [liveSection, modeState] = await Promise.all([
    getCurrentSection(),
    getScreenModeState(),
  ])

  // 没传 ?section= 时跳到当前板块；活动外则用默认 p1。
  const section = isSectionId(sp.section)
    ? sp.section
    : (liveSection ?? DEFAULT_SECTION)

  // Mark this user as recently active (used by /screen online count).
  // Fire-and-forget; don't await on the render path.
  void touchLastSeen(user.id)

  const qaHostId = modeState.mode === 'qa' ? modeState.qa_host_user_id : null

  const [posts, unreadMe, qaQuestionsRaw] = await Promise.all([
    fetchFeed(user.id, { section }),
    fetchUnreadMe(user),
    qaHostId
      ? fetchFeed(user.id, { questionTargetUserId: qaHostId, limit: 50 })
      : Promise.resolve([]),
  ])
  // 大屏按 like_count desc 排，这里同步保持一致 — 观众点赞会让自己关心的问题顶上去。
  const qaQuestions = [...qaQuestionsRaw].sort((a, b) => {
    if (b.like_count !== a.like_count) return b.like_count - a.like_count
    return b.created_at.localeCompare(a.created_at)
  })

  const viewerCanDm = isNonAnon(user)

  return (
    <>
      <Header active="feed" unreadMeCount={unreadMe.total} />
      <FeedRealtime />
      <DmRealtime viewerId={user.id} />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="mb-4">
          <EventHero liveSection={liveSection} />
        </div>
        <SectionTabs active={section} live={liveSection} />
        <SectionContextBar section={section} />
        <div className="mt-4 space-y-4">
          <OnboardingBanner />
          {modeState.mode === 'qa' && modeState.qa_host_name && (
            <>
              <QuestionComposer
                hostName={modeState.qa_host_name}
                hostTitle={modeState.qa_host_title}
                defaultNickname={user.nickname}
                defaultCompany={user.company}
              />
              {qaQuestions.length > 0 && (
                <section className="space-y-2">
                  <h2 className="px-1 text-sm font-semibold text-rose-700">
                    向「{modeState.qa_host_name}」提问 · 按点赞排序
                  </h2>
                  <div className="space-y-3">
                    {qaQuestions.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        viewerId={user.id}
                        viewerCanDm={viewerCanDm}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          <PostComposer
            defaultNickname={user.nickname}
            defaultCompany={user.company}
            defaultContactHandle={user.contact_handle}
            isVip={user.is_vip}
            vipName={user.vip_name}
            vipTitle={user.vip_title}
            section={section}
          />

          {posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
              这个板块还没有人发帖。第一条由你来。
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} viewerId={user.id} viewerCanDm={viewerCanDm} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
