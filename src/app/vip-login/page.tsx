import Link from 'next/link'
import { redirect } from 'next/navigation'
import { meetupPhase } from '@/lib/meetup15/event'

export const dynamic = 'force-dynamic'
export const metadata = { title: '嘉宾登录 · DAMS 第 15 期 Meetup' }

export default async function GuestLoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>
}) {
  if (meetupPhase() === 'closed') redirect('/?entry=ended')
  const { error } = await searchParams
  return (
    <main className="mx-auto w-full max-w-md space-y-5 px-5 py-12">
      <Link href="/" className="text-sm underline">返回活动首页</Link>
      <h1 className="text-2xl font-semibold">第 15 期嘉宾登录</h1>
      <p className="text-sm text-zinc-600">请使用主办方提供的用户名和密码。</p>
      <form method="post" action="/api/meetup/guest-login" className="space-y-3">
        <label className="block">
          用户名
          <input name="username" autoComplete="username" required maxLength={32}
            className="mt-1 block w-full rounded border border-zinc-400 px-3 py-2" />
        </label>
        <label className="block">
          密码
          <input name="password" type="password" autoComplete="current-password" required maxLength={128}
            className="mt-1 block w-full rounded border border-zinc-400 px-3 py-2" />
        </label>
        {error === '1' && <p role="alert">用户名或密码有误。</p>}
        <button className="rounded bg-teal-900 px-4 py-2 text-white">登录</button>
      </form>
    </main>
  )
}
