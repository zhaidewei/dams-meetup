import { cookies } from 'next/headers'
import { ACTIVITY_ADMIN_COOKIE } from '@/lib/session-cookie-crypto'
import { verifyCookie } from '@/lib/session-cookie'
import { ActivityControls } from './ActivityControls'

export const metadata = { title: '第 15 期 Meetup · 主办方入场控制' }

export default async function ActivityAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const cookie = (await cookies()).get(ACTIVITY_ADMIN_COOKIE)?.value
  const signedIn = verifyCookie(ACTIVITY_ADMIN_COOKIE, cookie) === '1'
  const { error } = await searchParams

  return (
    <main className="mx-auto w-full max-w-lg space-y-5 px-6 py-12">
      <h1 className="text-xl font-semibold">第 15 期 Meetup · 主办方入场控制</h1>
      {signedIn ? <ActivityControls /> : (
        <form method="post" action="/api/activity/session" className="space-y-3">
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
