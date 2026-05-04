import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { readAdminCookie, setAdminCookie } from '@/lib/identity'
import { fetchScreenData } from '@/lib/actions/screen'
import { getCurrentSection } from '@/lib/queries/event-state'
import { QRCode } from '@/components/QRCode'
import { ScreenView } from '@/components/screen/ScreenView'
import { ScreenAdminBar } from '@/components/screen/ScreenAdminBar'
import { EVENT_NAME } from '@/lib/constants'
import { isSectionId } from '@/lib/sections'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ section?: string; error?: string }>

export default async function ScreenPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams

  // /screen 只对持有 admin cookie 的客户端开放（主办方控制台），防止
  // 普通参会者误操作 / 误改板块进度。
  // 没 cookie → inline 渲染 token 输入表单（同一 URL，不跳转）。
  // /screen/auth?token=<x> route handler 也保留，方便脚本化 / 收藏链接。
  if (!(await readAdminCookie())) {
    return <AdminLoginPage error={sp.error === '1'} />
  }

  const section = isSectionId(sp.section) ? sp.section : null

  const [snap, h, currentSection] = await Promise.all([
    fetchScreenData(section),
    headers(),
    getCurrentSection(),
  ])

  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  // QR points to the feed of the same section, so attendees joining mid-talk
  // land in the right discussion stream.
  const feedPath = section ? `/feed?section=${section}` : '/feed'
  const feedUrl = host ? `${proto}://${host}${feedPath}` : feedPath

  return (
    <>
      <ScreenView
        key={section ?? 'all'}
        initialPosts={snap.posts}
        initialOnline={snap.online}
        eventName={EVENT_NAME}
        section={section}
        qrSlot={<QRCode value={feedUrl} size={160} />}
      />
      <ScreenAdminBar currentSection={currentSection} />
    </>
  )
}

async function adminLoginAction(formData: FormData) {
  'use server'
  const token = formData.get('token')
  const expected = process.env.ADMIN_TOKEN
  if (!expected || typeof token !== 'string' || token !== expected) {
    redirect('/screen?error=1')
  }
  await setAdminCookie()
  redirect('/screen')
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
