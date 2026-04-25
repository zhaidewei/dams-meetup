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
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-zinc-900">恢复链接</h2>
      <p className="mb-3 text-xs text-zinc-500">
        换浏览器或清缓存后，用这个链接找回身份（活动结束 7 天内有效）
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-xs text-zinc-800 focus:outline-none"
        />
        <CopyButton text={url} />
      </div>
    </div>
  )
}
