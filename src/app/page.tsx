import { redirect } from 'next/navigation'
import { ensureUser, getCurrentUser, readPwCookie, setPwCookie } from '@/lib/identity'
import { decideEntry, safeNext } from '@/lib/auth-gate'
import { EVENT_NAME, EVENT_ORGANIZER } from '@/lib/constants'
import { Agenda } from '@/components/Agenda'

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

  // 进入决策抽到 decideEntry（auth-gate.ts）— UT 覆盖 redirect loop 防护。
  // pw cookie 在但 user 不在时绝不能跳 /feed，否则 /feed 看到 user=null 会跳回 /
  // 形成 307 死循环（cookies 跨 Supabase 库 / users 行被清都会触发）。
  const pwOk = await readPwCookie()
  const userPresent = pwOk ? Boolean(await getCurrentUser()) : false
  const decision = decideEntry({ search: sp, pwOk, userPresent })
  if (decision.kind === 'recover') {
    const qs = new URLSearchParams({ u: decision.uid, t: decision.token })
    if (decision.next) qs.set('next', decision.next)
    redirect(`/recover?${qs.toString()}`)
  }
  if (decision.kind === 'enter') {
    redirect(decision.next)
  }

  const showError = sp.error === '1'
  const recoveryFailed = sp.error === 'recovery'
  const sessionReset = sp.error === 'reset'

  return (
    <main className="flex min-h-svh flex-col items-center bg-gradient-to-b from-blue-50 via-white to-white px-6 py-12">
      <div className="w-full max-w-2xl space-y-10">
        <header className="space-y-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
            {EVENT_ORGANIZER}
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">{EVENT_NAME}</h1>
        </header>

        <div className="mx-auto w-full max-w-sm space-y-6 rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur">
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
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {showError && <p className="mt-2 text-sm text-red-600">密码不对</p>}
              {recoveryFailed && (
                <p className="mt-2 text-sm text-amber-600">恢复链接已失效，请输入活动密码进入</p>
              )}
              {sessionReset && (
                <p className="mt-2 text-sm text-amber-600">会话已失效，请重新输入活动密码</p>
              )}
            </div>

            <input type="hidden" name="next" value={sp.next ?? ''} />

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              进入
            </button>
          </form>

          <p className="text-center text-xs text-zinc-400">
            密码请看现场幻灯片，或问主办方
          </p>

          <p className="text-center text-xs text-zinc-500">
            嘉宾请走
            <a href="/vip-login" className="ml-1 text-blue-600 underline underline-offset-2 hover:text-blue-700">
              嘉宾登录
            </a>
          </p>
        </div>

        <Agenda />
      </div>
    </main>
  )
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
