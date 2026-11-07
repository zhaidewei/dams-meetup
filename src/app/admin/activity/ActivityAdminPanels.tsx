'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ProjectionAdmin, type VersionedDraft } from '@/components/meetup15/ProjectionAdmin'

export function ActivityAdminPanels({ showProjection, children }: {
  showProjection: boolean
  children: ReactNode
}) {
  const [draft, setDraft] = useState<VersionedDraft | null>(null)

  if (!showProjection) return children

  return (
    <>
      <ProjectionAdmin draft={draft} setDraft={setDraft} />
      <Link href="/screen" className="block text-sm underline" target="_blank" rel="noopener">打开现场大屏</Link>
    </>
  )
}
