import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
}

initOpenNextCloudflareForDev()

export default nextConfig
