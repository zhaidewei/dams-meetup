'use client'

import Image from 'next/image'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

type ScreenState = { open: false } | { open: true; password: string; qrPath: string }

export function AdmissionScreen() {
  const [state, setState] = useState<ScreenState>({ open: false })
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
        const response = await fetch('/api/meetup/screen', { cache: 'no-store', signal: controller.signal })
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
    <section className="space-y-4">
      <p className="text-xl">扫码入场，或在活动首页输入现场密码</p>
      {qrImage?.url === state.qrPath &&
        <Image src={qrImage.image} alt="现场入场二维码" unoptimized width={320} height={320} className="mx-auto" />}
      <p className="font-mono text-3xl font-semibold tracking-wider">{state.password}</p>
    </section>
  ) : (
    <p>观众入口当前关闭。</p>
  )
}
