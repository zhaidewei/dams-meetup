import { NextResponse, type NextRequest } from 'next/server'
import { recoverUser } from '@/lib/identity'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const uid = searchParams.get('u')
  const token = searchParams.get('t')
  const next = searchParams.get('next')

  const target = safeNext(next)

  if (!uid || !token) {
    return NextResponse.redirect(new URL('/?error=recovery', req.url))
  }

  const user = await recoverUser(uid, token)
  if (!user) {
    return NextResponse.redirect(new URL('/?error=recovery', req.url))
  }

  return NextResponse.redirect(new URL(target, req.url))
}

function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/feed'
}
