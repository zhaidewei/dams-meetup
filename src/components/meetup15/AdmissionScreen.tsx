'use client'

import Image from 'next/image'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

type ScreenState = { open: false } | { open: true; password: string; qrPath: string }

export function AdmissionScreen({ compact = false, copyable = false }: { compact?: boolean; copyable?: boolean }) {
  const [state, setState] = useState<ScreenState>({ open: false })
  const [copyStatus, setCopyStatus] = useState('')
  const [qrImage, setQrImage] = useState<{ url: string; image: string } | null>(null)
  const qrPath = state.open ? state.qrPath : null

  useEffect(() => {
    if (!qrPath) return
    let active = true
    void QRCode.toDataURL(new URL(qrPath, window.location.href).href, { margin: 2, width: 400 }).then((image) => {
      if (active) setQrImage({ url: qrPath, image })
    }).catch(() => {
      if (active) setQrImage(null)
    })
    return () => { active = false }
  }, [qrPath])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function read() {
      try {
        const response = await fetch('/api/meetup/screen', {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]),
        })
        const next = response.ok ? await response.json<ScreenState>() : { open: false } as const
        if (!controller.signal.aborted) setState(next)
      } catch {
        if (!controller.signal.aborted) setState({ open: false })
      }
      if (!controller.signal.aborted) timer = setTimeout(read, 2000)
    }
    void read()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [])

  return state.open ? (
    <section aria-label="观众入场凭据" className="space-y-4">
      <p className={compact ? "text-sm" : "text-xl"}>扫码入场，或在活动首页输入现场密码</p>
      {qrImage?.url === state.qrPath &&
        <Image src={qrImage.image} alt="现场入场二维码" unoptimized width={320} height={320} className={compact ? "mx-auto h-auto w-24" : "mx-auto h-auto w-48 md:w-56"} />}
      <p className={compact ? "font-mono text-base" : "font-mono text-3xl font-semibold tracking-wider"}>{state.password}</p>
      {copyable && (
        <>
          <button type="button" className="min-h-11 rounded-full border border-dams-selection bg-white px-4 text-sm font-semibold text-dams-hover hover:bg-dams-wash"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.password)
                setCopyStatus('密码已复制。')
              } catch {
                setCopyStatus('复制失败，请选中上方密码手动复制。')
              }
            }}>复制密码</button>
          <p role="status" className="text-sm text-slate-600">{copyStatus}</p>
        </>
      )}
    </section>
  ) : (
    <p>观众入口当前关闭。</p>
  )
}
