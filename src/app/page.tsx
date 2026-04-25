import { redirect } from 'next/navigation'
import { ensureUser, readPwCookie, setPwCookie } from '@/lib/identity'
import { EVENT_NAME, EVENT_ORGANIZER } from '@/lib/constants'

type SearchParams = Promise<{
  u?: string
  t?: string
  error?: string
  next?: string
}>

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams

  // Recovery flow: ?u=<uuid>&t=<token> — delegate to /recover route handler.
  // (Cookie writes are not allowed in Server Components.)
  if (sp.u && sp.t) {
    const qs = new URLSearchParams({ u: sp.u, t: sp.t })
    if (sp.next) qs.set('next', sp.next)
    redirect(`/recover?${qs.toString()}`)
  }

  // Already authed → straight to feed
  if (await readPwCookie()) {
    redirect(safeNext(sp.next))
  }

  const showError = sp.error === '1'
  const recoveryFailed = sp.error === 'recovery'

  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-1 text-center">
          <p className="text-sm text-zinc-500">{EVENT_ORGANIZER}</p>
          <h1 className="text-2xl font-semibold">{EVENT_NAME}</h1>
        </header>

        <form action={loginAction} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm text-zinc-700 mb-1.5">
              活动密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="off"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            {showError && <p className="mt-2 text-sm text-red-600">密码不对</p>}
            {recoveryFailed && (
              <p className="mt-2 text-sm text-amber-600">恢复链接已失效，请输入活动密码进入</p>
            )}
          </div>

          <input type="hidden" name="next" value={sp.next ?? ''} />

          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            进入
          </button>
        </form>

        <p className="text-center text-xs text-zinc-400">
          密码请看现场幻灯片，或问主办方
        </p>
      </div>
    </main>
  )
}

function safeNext(next: string | undefined) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return next
  }
  return '/feed'
}

async function loginAction(formData: FormData) {
  'use server'
  const password = formData.get('password')
  const next = formData.get('next')
  const expected = process.env.EVENT_PASSWORD

  if (!expected || typeof password !== 'string' || password !== expected) {
    redirect('/?error=1')
  }

  await setPwCookie()
  await ensureUser()
  redirect(safeNext(typeof next === 'string' ? next : undefined))
}
