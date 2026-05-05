import Link from 'next/link'
import { vipLoginAction } from '@/lib/actions/vip'
import { EVENT_NAME, EVENT_ORGANIZER } from '@/lib/constants'

type SearchParams = Promise<{ error?: string }>

export default async function VipLoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  const errMsg =
    sp.error === 'missing'
      ? '请填写用户名和密码'
      : sp.error === 'bad'
        ? '用户名或密码不对'
        : null

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-blue-50 via-white to-white px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
            {EVENT_ORGANIZER}
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">{EVENT_NAME}</h1>
          <p className="text-sm text-zinc-600">嘉宾登录</p>
        </header>

        <form
          action={vipLoginAction}
          className="space-y-4 rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur"
        >
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm text-zinc-700">
              用户名
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-zinc-700">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errMsg && <p className="mt-2 text-sm text-red-600">{errMsg}</p>}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            进入
          </button>
        </form>

        <p className="text-center text-xs text-zinc-500">
          普通参会者请走
          <Link href="/" className="ml-1 text-blue-600 underline underline-offset-2 hover:text-blue-700">
            活动密码入口
          </Link>
        </p>
      </div>
    </main>
  )
}
