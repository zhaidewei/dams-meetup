'use client'

import { useState } from 'react'
import type { ModerationPage } from '@/lib/meetup15/discussion'
import { MEETUP_SECTIONS, isMeetupSection, type MeetupSection } from '@/lib/meetup15/event'
import { discussionButton, discussionInput } from './DiscussionComposer'
import { useDiscussion } from './useDiscussion'

const postTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Europe/Amsterdam', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

export function PostModeration() {
  const [section, setSection] = useState<MeetupSection>('lounge')
  const [pages, setPages] = useState<number[]>([])
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const before = pages.at(-1)
  const params = new URLSearchParams({ section })
  if (before) params.set('before', String(before))
  const { data, error, pending, submit } = useDiscussion<ModerationPage, { action: 'delete-post'; id: number }>(
    '/api/discussion/admin/posts?' + params,
  )

  async function deletePost(id: number) {
    setNotice('')
    if (await submit({ action: 'delete-post', id })) {
      setConfirmId(null)
      setNotice('帖子及其回复已删除。')
    }
  }

  return (
    <section aria-labelledby="moderation-heading" className="space-y-4 rounded-2xl border border-dams-line bg-white p-4 sm:p-5">
      <h1 id="moderation-heading" className="text-xl font-semibold">管理帖子</h1>
      <div className="max-w-sm space-y-1">
        <label htmlFor="moderation-section" className="block text-sm font-medium">讨论板块</label>
        <select id="moderation-section" className={discussionInput} value={section} disabled={pending}
          onChange={(event) => {
            if (!isMeetupSection(event.target.value)) return
            setSection(event.target.value)
            setPages([])
            setConfirmId(null)
            setNotice('')
          }}>
          {Object.entries(MEETUP_SECTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      {notice && <p role="status" className="text-sm text-dams-hover">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!data && !error && <p role="status" className="text-sm text-slate-600">正在读取帖子…</p>}
      {data && !data.canDelete && <p className="text-sm text-slate-600">本届互动已关闭，帖子仅供查看。</p>}
      {data?.posts.length === 0 && <p className="text-sm text-slate-600">本页暂无帖子。</p>}
      <ul className="space-y-3">
        {data?.posts.map((post) => (
          <li key={post.id} className="space-y-3 rounded-xl border border-dams-line p-3 sm:p-4">
            <p className="text-sm text-slate-700">
              <strong>{post.author}</strong> · {postTime.format(post.createdAt * 1000)} · {post.replyCount} 条回复
            </p>
            <p className="whitespace-pre-wrap break-words">{post.body}</p>
            {data.canDelete && (confirmId === post.id ? (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-900">确认删除这条帖子及其所有回复？</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={pending} onClick={() => void deletePost(post.id)}
                    className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
                    确认删除
                  </button>
                  <button type="button" className={discussionButton} disabled={pending} onClick={() => setConfirmId(null)}>取消</button>
                </div>
              </div>
            ) : (
              <button type="button" className={discussionButton + ' text-red-700'} disabled={pending}
                onClick={() => setConfirmId(post.id)}>删除帖子</button>
            ))}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {before && <button type="button" className={discussionButton} disabled={pending} onClick={() => {
          setConfirmId(null)
          setPages(previous => previous.slice(0, -1))
        }}>较新的帖子</button>}
        {data?.nextBefore && <button type="button" className={discussionButton} disabled={pending} onClick={() => {
          const cursor = data.nextBefore
          if (!cursor) return
          setConfirmId(null)
          setPages(previous => [...previous, cursor])
        }}>较早的帖子</button>}
      </div>
    </section>
  )
}
