import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const VERSION = 'v1'
const MAX_TOKEN_LENGTH = 2048

function signingKey(): string | null {
  const key = process.env.SESSION_SECRET
  return key && Buffer.byteLength(key, 'utf8') >= 32 ? key : null
}

function signature(name: string, payload: string, key: string): string {
  // 绑定 Cookie 名，阻止把普通用户/准入凭据复制成管理员凭据。
  return createHmac('sha256', key)
    .update(`${VERSION}.${name}.${payload}`)
    .digest('base64url')
}

export function signCookie(name: string, value: string, expires: Date): string {
  const key = signingKey()
  if (!key) throw new Error('SESSION_SECRET 必须配置为至少 32 字节的独立随机密钥')
  if (!Number.isSafeInteger(expires.getTime())) throw new Error('Cookie 过期时间无效')
  const payload = Buffer.from(JSON.stringify({ value, expiresAt: expires.getTime() }))
    .toString('base64url')
  return `${VERSION}.${payload}.${signature(name, payload, key)}`
}

export function verifyCookie(name: string, token: string | undefined): string | null {
  const key = signingKey()
  if (!key || !token || token.length > MAX_TOKEN_LENGTH) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [version, payload, mac] = parts
  if (version !== VERSION || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(mac)) {
    return null
  }
  const expected = signature(name, payload, key)
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null

  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data || typeof data !== 'object') return null
    const { value, expiresAt } = data as Record<string, unknown>
    if (typeof value !== 'string' || !value || !Number.isSafeInteger(expiresAt)) return null
    if ((expiresAt as number) <= Date.now()) return null
    return value
  } catch {
    return null
  }
}
