import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_PW } from './lib/identity'

// Public paths that bypass the password gate
const PUBLIC_EXACT = new Set<string>(['/'])

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next()

  // Allow recovery-link entry: /?u=<uuid>&t=<token> handled by /
  // Allow VIP claim entry: ?vip=<token> handled by gated layout
  if (searchParams.has('u') && searchParams.has('t')) return NextResponse.next()

  if (req.cookies.get(COOKIE_PW)?.value) return NextResponse.next()

  const loginUrl = new URL('/', req.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
}
