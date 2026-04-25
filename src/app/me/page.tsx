import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { Header } from '@/components/Header'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  return (
    <>
      <Header active="me" />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
          我 tab — 占位（task #11 实现：我发的帖子 + 收到的回复 + 恢复链接）
        </div>
      </main>
    </>
  )
}
