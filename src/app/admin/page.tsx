import { redirect } from 'next/navigation'
import { readAdminCookie, setAdminCookie } from '@/lib/identity'
import { getEventStateBundle, listVipUsers } from '@/lib/queries/event-state'
import { fetchQuestionsForHost } from '@/lib/queries/questions'
import { AdminConsole } from '@/components/admin/AdminConsole'

// /admin (issue #45) — 移动端友好的主办方控制台，从 /screen ScreenAdminBar 拆出来。
// 复用 admin cookie：从 /screen/auth?token= 进来过的浏览器自动通过。
// 新设备没 cookie → 内联密码表单（同款 /screen 的 AdminLoginPage）。
export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ error?: string }>

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams

  if (!(await readAdminCookie())) {
    return <AdminLoginPage error={sp.error === '1'} />
  }

  const [eventState, vips] = await Promise.all([
    getEventStateBundle(),
    listVipUsers(),
  ])

  // 仅在 mode='qa' 拉问题列表给控制台。includeAnswered=true 让主办方
  // 看到全集，已答行渲染撤销按钮。limit 50 — 一场 QA 极少超过这个量。
  const qaHostId = eventState.modeState.qa_host_user_id
  const qaQuestions =
    eventState.modeState.mode === 'qa' && qaHostId
      ? await fetchQuestionsForHost(qaHostId, 50, { includeAnswered: true })
      : null

  return (
    <AdminConsole
      currentSection={eventState.liveSection}
      modeState={eventState.modeState}
      vips={vips}
      qaQuestions={qaQuestions}
    />
  )
}

async function adminLoginAction(formData: FormData) {
  'use server'
  const token = formData.get('token')
  const expected = process.env.ADMIN_TOKEN
  if (!expected || typeof token !== 'string' || token !== expected) {
    redirect('/admin?error=1')
  }
  await setAdminCookie()
  redirect('/admin')
}

function AdminLoginPage({ error }: { error: boolean }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">主办方控制台</h1>
          <p className="text-xs text-zinc-400">输入控制台密码进入</p>
        </header>
        <form action={adminLoginAction} className="space-y-3">
          <input
            name="token"
            type="password"
            required
            autoFocus
            autoComplete="off"
            placeholder="控制台密码"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
          {error && <p className="text-sm text-rose-400">密码不对</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white"
          >
            进入
          </button>
        </form>
      </div>
    </main>
  )
}
