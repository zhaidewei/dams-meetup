import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { Header } from '@/components/Header'

export const dynamic = 'force-dynamic'

export default async function MatchesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  return (
    <>
      <Header active="matches" />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
          撮合 tab — 占位（task #13 实现：AI 匹配的帖子和人）
        </div>
      </main>
    </>
  )
}
