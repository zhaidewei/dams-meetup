import { NextResponse, type NextRequest } from 'next/server'
import { setAdminCookie } from '@/lib/identity'

// /screen/auth?token=<x> — 验证 admin token，set cookie，跳回 /screen。
// 主办方把这个 URL 收藏一次，之后每次开 /screen 直接走 cookie。
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const expected = process.env.ADMIN_TOKEN

  if (!expected || !token || token !== expected) {
    return NextResponse.redirect(new URL('/feed', req.url))
  }

  await setAdminCookie()
  return NextResponse.redirect(new URL('/screen', req.url))
}
