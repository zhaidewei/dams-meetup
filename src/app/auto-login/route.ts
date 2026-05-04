import { NextResponse, type NextRequest } from 'next/server'
import { ensureUser, setPwCookie } from '@/lib/identity'

// 现场 /screen 的 QR 码扫进来，URL 自带活动密码 → 自动写 cookie + 创建身份 →
// 跳到 next。Server Component 不能写 cookie，所以走 route handler。
//
// 安全说明：URL 里明文带密码等价于把密码贴在大屏上让大家扫，本来就是公开
// 给当场观众的。
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const password = searchParams.get('p')
  const next = safeNext(searchParams.get('next'))
  const expected = process.env.EVENT_PASSWORD

  if (!expected || password !== expected) {
    return NextResponse.redirect(new URL('/?error=1', req.url))
  }

  await setPwCookie()
  await ensureUser()
  return NextResponse.redirect(new URL(next, req.url))
}

function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/feed'
}
