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
    // suppressHydrationWarning: iPhone Chrome injects __gcrremoteframetoken
    // on <html> and __gcruniqueid on every <form>/<input>/<textarea> (Google
    // Chrome iOS internal cross-page form-fill feature). Without this flag
    // the root-level attribute mismatch makes React 19 abort hydration of
    // the whole tree, breaking every onClick/onChange/useState on iOS Chrome
    // (and likely iOS Safari). The progressive-enhancement form actions in
    // PostComposer/ReplySection/PollComposer/LikeButton/LogoutButton are the
    // primary defense; this just lets React finish hydrating instead of
    // bailing on the root.
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-dams-canvas text-dams-ink">{children}</body>
    </html>
  )
}
