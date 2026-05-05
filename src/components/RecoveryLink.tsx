import { headers } from 'next/headers'
import { CopyButton } from './CopyButton'

type Props = {
  uid: string
  token: string
}

export async function RecoveryLink({ uid, token }: Props) {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = host ? `${proto}://${host}` : ''
  const url = `${origin}/recover?u=${uid}&t=${token}`

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-zinc-900">恢复链接</h2>
      <p className="mb-3 text-xs text-zinc-600">
        换浏览器或清缓存后，用这个链接找回身份（活动结束 7 天内有效）
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-800 focus:outline-none"
        />
        <CopyButton text={url} />
      </div>
    </div>
  )
}
