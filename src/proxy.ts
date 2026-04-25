import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_PW } from './lib/identity'

// Public paths that bypass the password gate
const PUBLIC_EXACT = new Set<string>(['/', '/recover', '/vip-login'])

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next()

  if (req.cookies.get(COOKIE_PW)?.value) return NextResponse.next()

  const loginUrl = new URL('/', req.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
}
