import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { fetchScreenData } from '@/lib/actions/screen'
import { QRCode } from '@/components/QRCode'
import { ScreenView } from '@/components/screen/ScreenView'
import { EVENT_NAME } from '@/lib/constants'
import { isSectionId } from '@/lib/sections'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ section?: string }>

export default async function ScreenPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const sp = await searchParams
  const section = isSectionId(sp.section) ? sp.section : null

  const [snap, h] = await Promise.all([fetchScreenData(section), headers()])

  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  // QR points to the feed of the same section, so attendees joining mid-talk
  // land in the right discussion stream.
  const feedPath = section ? `/feed?section=${section}` : '/feed'
  const feedUrl = host ? `${proto}://${host}${feedPath}` : feedPath

  return (
    <ScreenView
      key={section ?? 'all'}
      initialPosts={snap.posts}
      initialOnline={snap.online}
      eventName={EVENT_NAME}
      section={section}
      qrSlot={<QRCode value={feedUrl} size={160} />}
    />
  )
}
