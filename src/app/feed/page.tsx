import { redirect } from 'next/navigation'
import { getCurrentUser, readAdminCookie, touchLastSeen } from '@/lib/identity'
import { Header } from '@/components/Header'
import { EventHero } from '@/components/EventHero'
import { PostComposer } from '@/components/PostComposer'
import { QuestionComposer } from '@/components/QuestionComposer'
import { PostCard } from '@/components/PostCard'
import { InfiniteFeed } from '@/components/InfiniteFeed'
import { SectionTabs } from '@/components/SectionTabs'
import { SectionContextBar } from '@/components/SectionContextBar'
import { OnboardingBanner } from '@/components/OnboardingBanner'
import { FeedRealtime } from '@/components/FeedRealtime'
import { DmRealtime } from '@/components/DmRealtime'
import { fetchFeed } from '@/lib/queries/posts'
import { fetchUnreadMe } from '@/lib/queries/unread'
import { getEventStateBundle } from '@/lib/queries/event-state'
import { isNonAnon } from '@/lib/dm'
import { DEFAULT_SECTION, isSectionId } from '@/lib/sections'

export const dynamic = 'force-dynamic'

// SSR 首屏只拉最新 20 条；用户主动「加载更早」时由 InfiniteFeed 客户端组件
// 通过 server action 拉历史。理由：CF Workers Free 10ms CPU/req 是硬上限，
// SSR 100 条 + replies join 在 seeded 数据下会触发 5xx；20 条把 SSR cost
// 砍到 1/5。
const FEED_PAGE_SIZE = 20

type SearchParams = Promise<{ section?: string }>

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser()
  // pw cookie 在但 user 不存在 = 跨库 uid / users 被清 / cookie 残缺。带 ?error=reset
  // 让 / 显示「会话已失效」提示，避免用户疑惑「为什么又看到密码框」。
  if (!user) redirect('/?error=reset')

  const sp = await searchParams
  if (sp.section !== undefined && !isSectionId(sp.section)) {
    redirect(`/feed?section=${DEFAULT_SECTION}`)
  }

  // 「当前板块」= 主办方覆写 → 议程时间表 → null（活动外 / 空档）。
  // 用于 (a) /feed 默认跳当前板块；(b) SectionTabs LIVE 标。
  // event_state 一行查两组字段 — 5/9 实测 PostgREST 池在 200 并发下被
  // 重复 round-trip 打爆，合并查询省一次 DB 连接。
  const { liveSection, modeState } = await getEventStateBundle()

  // 没传 ?section= 时跳到当前板块；活动外则用默认 p1。
  const section = isSectionId(sp.section)
    ? sp.section
    : (liveSection ?? DEFAULT_SECTION)

  // Mark this user as recently active (used by /screen online count).
  // Fire-and-forget; don't await on the render path.
  void touchLastSeen(user.id)

  // QA 与 section 严格绑定（issue #37）：只在当前查看的 section 与 qa_section 匹配时
  // 渲染 QA UI。startQa 时若没有 LIVE section，会落到 DEFAULT_SECTION (lounge)；
  // 历史脏数据中可能有 null，这里同样兜底到 lounge，避免在所有 section 下都显示。
  const qaSection = modeState.qa_section ?? DEFAULT_SECTION
  const qaHostId =
    modeState.mode === 'qa' && qaSection === section ? modeState.qa_host_user_id : null
  // 上一轮 QA：只有 mode=default 且 section 匹配时显示塌陷区块。
  const lastQaSection = modeState.last_qa_section ?? DEFAULT_SECTION
  const lastQaHostId =
    modeState.mode === 'default' && lastQaSection === section
      ? modeState.last_qa_host_user_id
      : null

  const [posts, unreadMe, qaQuestionsRaw, lastQaQuestionsRaw, viewerIsAdmin] =
    await Promise.all([
      fetchFeed(user.id, { section, limit: FEED_PAGE_SIZE }),
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
      // 同 like 时 FIFO（先提的排前面）— 与 /screen 的 fetchQuestionsForHost 保持一致。
      return a.created_at.localeCompare(b.created_at)
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
                viewerIsAnon={!viewerCanDm}
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
            aiConsentGiven={!!user.ai_consent_at}
          />

          <InfiniteFeed
            initial={posts}
            pageSize={FEED_PAGE_SIZE}
            section={section}
            viewerId={user.id}
            viewerCanDm={viewerCanDm}
            viewerIsAdmin={viewerIsAdmin}
          />
        </div>
      </main>
    </>
  )
}
