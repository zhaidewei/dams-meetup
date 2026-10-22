import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFeed } from './posts'

const mocks = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }))
vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        in: () => query,
        eq: () => query,
        lt: () => query,
        then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: mocks.tables[table] ?? [], error: null }).then(resolve),
      }
      return query
    },
  }),
}))

const user = (id: string, show = false) => ({
  id, nickname: id, company: null, contact_handle: `${id}@example.invalid`,
  show_contact: show, is_vip: false, vip_name: null, vip_title: null,
})

function fixture() {
  return {
    id: 1, user_id: 'author', type: 'poll', body: 'Dummy poll', tags: [],
    // 帖子的历史开关不得覆盖资料里的关闭状态。
    show_contact: true, section: 'p1', poll_options: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }],
    poll_multi: false, poll_hide_results: true, poll_deadline: '2026-10-23T00:00:00Z',
    created_at: '2026-10-22T00:00:00Z', like_count: 0, author: user('author'),
    replies: [{
      id: 2, user_id: 'replier', parent_reply_id: null, body: 'Dummy reply',
      created_at: '2026-10-22T00:00:00Z', updated_at: null, is_ai: false,
      visibility: 'public', author: [user('replier')], mentioned_user: [user('mentioned')],
    }],
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  mocks.tables = {
    posts: [fixture()], likes: [], post_match_intents: [],
    poll_votes: [{ post_id: 1, user_id: 'other-voter', option_id: 1 }],
  }
})
afterEach(() => vi.useRealTimers())

describe('feed 数据权限边界', () => {
  it('序列化响应不含作者、回复者和被推荐用户未公开的联系方式', async () => {
    const result = await fetchFeed('viewer')
    expect(result[0].author.contact_handle).toBeNull()
    expect(result[0].replies[0].author?.contact_handle).toBeNull()
    expect(result[0].replies[0].mentioned_user?.contact_handle).toBeNull()
    expect(JSON.stringify(result)).not.toContain('@example.invalid')
    // 不修改数据库取回的原始资料或所有者之后的编辑数据。
    expect((mocks.tables.posts[0] as ReturnType<typeof fixture>).author.contact_handle)
      .toBe('author@example.invalid')
  })

  it('保留用户已同意公开的联系方式', async () => {
    const row = fixture()
    row.author.show_contact = true
    row.replies[0].author[0].show_contact = true
    row.replies[0].mentioned_user[0].show_contact = true
    mocks.tables.posts = [row]
    const [post] = await fetchFeed('viewer')
    expect(post.author.contact_handle).toBe('author@example.invalid')
    expect(post.replies[0].author?.contact_handle).toBe('replier@example.invalid')
    expect(post.replies[0].mentioned_user?.contact_handle).toBe('mentioned@example.invalid')
  })

  it.each(['viewer', 'author'])('未投票的 %s 收不到未截止隐藏投票的选项计数', async (viewer) => {
    const [post] = await fetchFeed(viewer)
    expect(post.poll_option_counts).toBeUndefined()
    expect(JSON.stringify(post)).not.toContain('poll_option_counts')
    expect(post.poll_total_votes).toBe(1)
    expect(post.poll_my_vote_options).toEqual([])
  })

  it('已投票者仍能查看计数和自己的选项', async () => {
    mocks.tables.poll_votes.push({ post_id: 1, user_id: 'viewer', option_id: 2 })
    const [post] = await fetchFeed('viewer')
    expect(post.poll_option_counts).toEqual({ 1: 1, 2: 1 })
    expect(post.poll_my_vote_options).toEqual([2])
  })

  it.each(['2026-10-22T11:59:59Z', '2026-10-22T12:00:00Z'])('截止后或截止瞬间公开结果：%s', async (deadline) => {
    const row = fixture()
    row.poll_deadline = deadline
    mocks.tables.posts = [row]
    const [post] = await fetchFeed('viewer')
    expect(post.poll_option_counts).toEqual({ 1: 1 })
  })

  it('非隐藏投票直接公开结果', async () => {
    const row = fixture()
    row.poll_hide_results = false
    mocks.tables.posts = [row]
    const [post] = await fetchFeed('viewer')
    expect(post.poll_option_counts).toEqual({ 1: 1 })
  })

  it('无效截止时间不会提前公开隐藏结果', async () => {
    const row = fixture()
    row.poll_deadline = 'invalid'
    mocks.tables.posts = [row]
    expect((await fetchFeed('viewer'))[0].poll_option_counts).toBeUndefined()
  })
})
