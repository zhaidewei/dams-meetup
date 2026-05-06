'use server'

import { getCurrentUser } from '@/lib/identity'
import { fetchFeed, type FeedPost } from '@/lib/queries/posts'
import { isSectionId, type SectionId } from '@/lib/sections'

// Cursor-based 分页加载更早的帖子。客户端 InfiniteFeed 调用，每次返回 limit 条
// created_at 严格早于 before 的帖。
export async function loadMorePostsAction(input: {
  before: string
  section: SectionId
  limit: number
}): Promise<FeedPost[]> {
  const user = await getCurrentUser()
  if (!user) return []
  if (!isSectionId(input.section)) return []
  const limit = Math.min(Math.max(input.limit, 1), 50)
  return fetchFeed(user.id, {
    section: input.section,
    before: input.before,
    limit,
  })
}
