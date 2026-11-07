import Link from 'next/link'
import { isMeetupAdmin } from '@/lib/meetup15/server'
import { DiscussionAdmin } from '@/components/meetup15/DiscussionAdmin'
import { ActivityAdminPanels } from './ActivityAdminPanels'
import { ActivityControls } from './ActivityControls'

export const metadata = { title: '第 15 期 Meetup · 主办方控制台' }

const ADMIN_TABS = {
  screen: '大屏',
  entry: '入场',
  agenda: '议程',
  qa: '嘉宾问答',
  guests: '嘉宾',
} as const

export default async function ActivityAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; guest?: string; tab?: string }>
}) {
  const [signedIn, { error, guest, tab }] = await Promise.all([isMeetupAdmin(), searchParams])
  const selected = tab && Object.hasOwn(ADMIN_TABS, tab) ? tab : guest ? 'guests' : 'screen'

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8 sm:px-6">
      <header className="space-y-4 border-b border-zinc-200 pb-3">
        <p className="text-xl font-semibold">第 15 期 Meetup · 主办方控制台</p>
        {signedIn && (
          <nav aria-label="主办方导航" className="flex flex-wrap gap-1">
            {Object.entries(ADMIN_TABS).map(([key, label]) => (
              <Link key={key} href={`/admin/activity?tab=${key}`} aria-current={selected === key ? 'page' : undefined}
                className={`rounded-md px-3 py-2 text-sm ${selected === key ? 'bg-teal-100 font-semibold text-teal-900' : 'text-zinc-700 hover:bg-zinc-100'}`}>
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
          {selected === 'guests' && <section className="max-w-lg space-y-3">
            <h2 className="text-lg font-semibold">配置嘉宾账号</h2>
            <p className="text-sm text-zinc-600">用相同用户名保存，会更新姓名、头衔和密码，保留嘉宾身份。</p>
            {guest === 'saved' && <p role="status">嘉宾账号已保存。</p>}
            {guest === 'invalid' && <p role="alert">请检查用户名、姓名和密码要求。</p>}
            <form method="post" action="/api/meetup/guests" className="space-y-3">
              <label className="block text-sm">
                用户名
                <input name="username" autoComplete="off" minLength={3} maxLength={32}
                  pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,31}" required
                  className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
              </label>
              <p className="text-xs text-zinc-600">3–32 位字母、数字、点、下划线或连字符。</p>
              <label className="block text-sm">
                姓名
                <input name="displayName" required maxLength={80}
                  className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
              </label>
              <label className="block text-sm">
                头衔
                <input name="title" maxLength={120}
                  className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
              </label>
              <label className="block text-sm">
                嘉宾密码
                <input name="password" type="password" minLength={12} maxLength={128}
                  required autoComplete="new-password"
                  className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
              </label>
              <p className="text-xs text-zinc-600">至少 12 个字符，请通过私下渠道交给嘉宾。</p>
              <button className="rounded bg-zinc-900 px-4 py-2 text-white">保存嘉宾账号</button>
            </form>
          </section>}
        </ActivityAdminPanels>
      ) : (
        <form method="post" action="/api/activity/session" className="max-w-lg space-y-3">
          <h1 className="text-lg font-semibold">主办方登录</h1>
          <label htmlFor="token" className="block">主办方密码</label>
          <input id="token" name="token" type="password" required autoComplete="current-password"
            className="w-full rounded border border-zinc-300 px-3 py-2" />
          {error === '1' && <p role="alert">密码不对</p>}
          <button className="rounded bg-zinc-900 px-4 py-2 text-white">登录</button>
        </form>
      )}
    </main>
  )
}
