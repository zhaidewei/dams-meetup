import Link from 'next/link'
import { isMeetupAdmin } from '@/lib/meetup15/server'
import { PostModeration } from '@/components/meetup15/PostModeration'
import { DiscussionAdmin } from '@/components/meetup15/DiscussionAdmin'
import { ActivityAdminPanels } from './ActivityAdminPanels'
import { ActivityControls } from './ActivityControls'
import { GuestAccounts } from './GuestAccounts'
import { LiveStatsPanel } from './LiveStatsPanel'
import { RehearsalControls } from './RehearsalControls'
import { SummaryControls } from './SummaryControls'

export const metadata = { title: '第 15 期 Meetup · 主办方控制台' }

const ADMIN_TABS = {
  screen: '控制大屏',
  entry: '管理入场',
  agenda: '议程切换',
  qa: '管理问答',
  posts: '管理帖子',
  guests: '配置嘉宾',
  stats: '查看实时统计',
  rehearsal: '管理彩排',
  summary: '发布复盘与归档',
} as const

export default async function ActivityAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string; guest?: string; tab?: string; summary?: string; rehearsal?: string }>
}) {
  const [signedIn, { error, edit, guest, tab, summary, rehearsal }] = await Promise.all([isMeetupAdmin(), searchParams])
  const selected = tab && Object.hasOwn(ADMIN_TABS, tab) ? tab : guest ? 'guests' : 'screen'

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8 sm:px-6">
      <header className="space-y-4 rounded-2xl border border-dams-line bg-dams-wash p-4 sm:p-5">
        <p className="text-xl font-semibold">第 15 期 Meetup · 主办方控制台</p>
        {signedIn && (
          <nav aria-label="主办方导航" className="flex gap-1 overflow-x-auto">
            {Object.entries(ADMIN_TABS).map(([key, label]) => (
              <Link key={key} href={`/admin/activity?tab=${key}`} aria-current={selected === key ? 'page' : undefined}
                className={`min-h-11 shrink-0 rounded-full px-4 py-2.5 text-sm ${selected === key ? 'bg-dams-selection font-semibold text-dams-hover' : 'text-zinc-700 hover:bg-dams-wash'}`}>
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {signedIn ? (
        <ActivityAdminPanels showProjection={selected === 'screen'}>
          {selected === 'entry' && <ActivityControls />}
          {selected === 'agenda' && <DiscussionAdmin view="agenda" />}
          {selected === 'qa' && <DiscussionAdmin view="qa" />}
          {selected === 'posts' && <PostModeration />}
          {selected === 'stats' && <LiveStatsPanel />}
          {selected === 'rehearsal' && <RehearsalControls status={rehearsal} />}
          {selected === 'summary' && <SummaryControls status={summary} />}
          {selected === 'guests' && <GuestAccounts edit={edit} status={guest} />}
        </ActivityAdminPanels>
      ) : (
        <form method="post" action="/api/activity/session" className="max-w-lg space-y-3">
          <h1 className="text-lg font-semibold">主办方登录</h1>
          <label htmlFor="token" className="block">主办方密码</label>
          <input id="token" name="token" type="password" required autoComplete="current-password"
            className="w-full rounded border border-zinc-300 px-3 py-2" />
          {error === '1' && <p role="alert">密码不对</p>}
          <button className="min-h-11 rounded-full bg-dams-blue px-5 py-2 text-white">登录</button>
        </form>
      )}
    </main>
  )
}
