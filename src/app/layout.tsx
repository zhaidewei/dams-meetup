import type { Metadata, Viewport } from 'next'
import './globals.css'
import { EVENT_NAME } from '@/lib/constants'

export const metadata: Metadata = {
  title: EVENT_NAME,
  description: '现场互动讨论 — 帖子、投票、撮合',
}

export const viewport: Viewport = {
  themeColor: '#18181b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  )
}
