import { redirect } from 'next/navigation'
import { getCurrentUser, readAdminCookie, touchLastSeen } from '@/lib/identity'
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

  // QA 与 section 绑定（issue #37）：只在当前查看的 section 与 qa_section 匹配时
  // 渲染 QA UI。qa_section 为 null（活动外/空档期启动）时退化为「所有 section 下都显示」。
  const qaSectionMatches =
    modeState.qa_section === null || modeState.qa_section === section
  const qaHostId =
    modeState.mode === 'qa' && qaSectionMatches ? modeState.qa_host_user_id : null
  // 上一轮 QA：只有 mode=default 且 section 匹配时显示塌陷区块。
  const lastQaSectionMatches =
    modeState.last_qa_section === null || modeState.last_qa_section === section
  const lastQaHostId =
    modeState.mode === 'default' && lastQaSectionMatches
      ? modeState.last_qa_host_user_id
      : null

  const [posts, unreadMe, qaQuestionsRaw, lastQaQuestionsRaw, viewerIsAdmin] =
    await Promise.all([
      fetchFeed(user.id, { section }),
      fetchUnreadMe(user),
      qaHostId
        ? fetchFeed(user.id, { questionTargetUserId: qaHostId, limit: 50 })
        : Promise.resolve([]),
      lastQaHostId
        ? fetchFeed(user.id, { questionTargetUserId: lastQaHostId, limit: 50 })
        : Promise.resolve([]),
      readAdminCookie(),
    ])
  // 大屏按 like_count desc 排，这里同步保持一致 — 观众点赞会让自己关心的问题顶上去。
  // 同时把 answered 的沉到底（即使点赞高也不挤占）。
  const sortQuestions = (xs: typeof qaQuestionsRaw) =>
    [...xs].sort((a, b) => {
      const aDone = a.answered_at ? 1 : 0
      const bDone = b.answered_at ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      if (b.like_count !== a.like_count) return b.like_count - a.like_count
      return b.created_at.localeCompare(a.created_at)
    })
  const qaQuestions = sortQuestions(qaQuestionsRaw)
  const lastQaQuestions = sortQuestions(lastQaQuestionsRaw)

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
                        viewerIsAdmin={viewerIsAdmin}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {/* 上一轮 QA 归档：默认塌陷，可展开。结束 QA 时 host 已被搬到 last_qa_host_user_id */}
          {lastQaHostId && lastQaQuestions.length > 0 && modeState.last_qa_host_name && (
            <details className="group rounded-2xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between text-sm text-zinc-700">
                <span>
                  上一轮 QA · 向「{modeState.last_qa_host_name}」 ·{' '}
                  <span className="text-zinc-500">{lastQaQuestions.length} 个问题</span>
                </span>
                <span className="text-xs text-zinc-400 group-open:hidden">展开 ↓</span>
                <span className="hidden text-xs text-zinc-400 group-open:inline">收起 ↑</span>
              </summary>
              <div className="mt-3 space-y-3">
                {lastQaQuestions.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    viewerId={user.id}
                    viewerCanDm={viewerCanDm}
                    viewerIsAdmin={viewerIsAdmin}
                  />
                ))}
              </div>
            </details>
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
                <PostCard
                  key={post.id}
                  post={post}
                  viewerId={user.id}
                  viewerCanDm={viewerCanDm}
                  viewerIsAdmin={viewerIsAdmin}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
