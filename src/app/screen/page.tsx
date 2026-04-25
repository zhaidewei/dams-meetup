import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'

export const dynamic = 'force-dynamic'

export default async function ScreenPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  return (
    <main className="flex min-h-svh items-center justify-center bg-zinc-950 text-zinc-300">
      <div className="text-center">
        <p className="text-2xl">大屏模式 — 占位</p>
        <p className="mt-2 text-sm text-zinc-500">task #7 实现：自动滚动 + 投票全屏接管</p>
      </div>
    </main>
  )
}
