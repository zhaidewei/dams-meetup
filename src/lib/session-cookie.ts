import 'server-only'
import { signSessionCookie, verifySessionCookie } from './session-cookie-crypto'

export function signCookie(name: string, value: string, expires: Date): string {
  return signSessionCookie(name, value, expires, process.env.SESSION_SECRET)
}

export function verifyCookie(name: string, token: string | undefined): string | null {
  return verifySessionCookie(name, token, process.env.SESSION_SECRET)
}
