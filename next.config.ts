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
}

initOpenNextCloudflareForDev()

export default nextConfig
