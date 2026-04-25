import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { fetchScreenData } from '@/lib/actions/screen'
import { QRCode } from '@/components/QRCode'
import { ScreenView } from '@/components/screen/ScreenView'
import { EVENT_NAME } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export default async function ScreenPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const [snap, h] = await Promise.all([fetchScreenData(), headers()])

  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const feedUrl = host ? `${proto}://${host}/feed` : '/feed'

  return (
    <ScreenView
      initialPosts={snap.posts}
      initialOnline={snap.online}
      eventName={EVENT_NAME}
      qrSlot={<QRCode value={feedUrl} size={160} />}
    />
  )
}
