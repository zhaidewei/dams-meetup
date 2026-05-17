import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Allow LAN IPs to load dev assets without cross-site dev block. Without
  // this, Next 16 blocks /_next/* requests whose Origin header doesn't match
  // an allowed value — the side effect on iPhone Chrome was a half-aborted
  // hydration where SSR HTML rendered but React event listeners never bound,
  // making every onClick / onChange / useState appear dead while Link nav
  // and form submits still worked. See investigation 2026-05-03.
  allowedDevOrigins: ['192.168.68.110'],

  // 活动落幕后：全部 UI 路由打到 /summary（再见页 + 数据复盘）。
  // 下届启动时把整个 redirects() 注释掉或删掉即可恢复（见 docs/next-event-bootstrap.md）。
  async redirects() {
    const dest = '/summary'
    return [
      { source: '/',                    destination: dest, permanent: false },
      { source: '/feed',                destination: dest, permanent: false },
      { source: '/feed/:path*',         destination: dest, permanent: false },
      { source: '/me',                  destination: dest, permanent: false },
      { source: '/me/:path*',           destination: dest, permanent: false },
      { source: '/screen',              destination: dest, permanent: false },
      { source: '/screen/:path*',       destination: dest, permanent: false },
      { source: '/agenda',              destination: dest, permanent: false },
      { source: '/ppt',                 destination: dest, permanent: false },
      { source: '/vip-login',           destination: dest, permanent: false },
      { source: '/admin',               destination: dest, permanent: false },
      { source: '/admin/:path*',        destination: dest, permanent: false },
      { source: '/recover',             destination: dest, permanent: false },
      { source: '/auto-login',          destination: dest, permanent: false },
    ]
  },
}

initOpenNextCloudflareForDev()

export default nextConfig
