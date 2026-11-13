import Link from 'next/link'
import type { ReactNode } from 'react'
import { ProjectionAdmin } from '@/components/meetup15/ProjectionAdmin'

export function ActivityAdminPanels({ showProjection, children }: {
  showProjection: boolean
  children: ReactNode
}) {
  if (!showProjection) return children

  return (
    <>
      <ProjectionAdmin />
      <Link href="/screen" className="block text-sm underline" target="_blank" rel="noopener">打开现场大屏</Link>
    </>
  )
}
