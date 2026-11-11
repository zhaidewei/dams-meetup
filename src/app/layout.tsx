import type { Metadata, Viewport } from 'next'
import './globals.css'
import { MEETUP_NAME, MEETUP_THEME } from '@/lib/meetup15/event'

export const metadata: Metadata = {
  title: MEETUP_NAME,
  description: MEETUP_THEME,
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
    // iOS Chrome can inject attributes before React hydrates the document.
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-dams-canvas text-dams-ink">{children}</body>
    </html>
  )
}
