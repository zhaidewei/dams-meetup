import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { Header } from '@/components/Header'
import { PostComposer } from '@/components/PostComposer'
import { PostCard } from '@/components/PostCard'
import { fetchFeed } from '@/lib/queries/posts'

export const dynamic = 'force-dynamic'

export default async function FeedPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const posts = await fetchFeed(user.id)

  return (
    <>
      <Header active="feed" />
      <main className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="space-y-4">
          <PostComposer
            defaultNickname={user.nickname}
            defaultCompany={user.company}
            defaultContactHandle={user.contact_handle}
            defaultShowContact={user.show_contact}
          />

          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
              还没有人发帖。第一条由你来。
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
