import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllCookies, COOKIE_ADMIN, COOKIE_PW, COOKIE_UID, getCurrentUser,
  readAdminCookie, readPwCookie, readUidCookie, recoverUser,
  setAdminCookie, setPwCookie, setUidCookie,
} from './identity'
import { setCurrentSectionAction } from './actions/event-state'

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn(),
  remove: vi.fn(),
  db: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.values.get(name)
      return value === undefined ? undefined : { value }
    },
    set: mocks.set,
    delete: mocks.remove,
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('./supabase/server', () => ({ getServerSupabase: mocks.db }))
vi.mock('./queries/event-state', () => ({ getCurrentSection: vi.fn() }))
vi.mock('./constants', async (importOriginal) => ({
  ...await importOriginal<typeof import('./constants')>(),
  cookieExpiresAt: () => new Date('2026-10-28T12:00:00Z'),
}))

const USER_ID = 'c21bbe09-1b67-4aab-9bbd-9a0a5a30aefa'
const TEST_KEY = 'unit-test-only-signing-key-never-use-in-production'
const EXPIRES = new Date('2026-10-28T12:00:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
  vi.stubEnv('SESSION_SECRET', TEST_KEY)
  mocks.values.clear()
  vi.clearAllMocks()
  mocks.set.mockImplementation((name: string, value: string) => mocks.values.set(name, value))
  mocks.remove.mockImplementation((name: string) => mocks.values.delete(name))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('签名身份与权限 Cookie', () => {
  it('拒绝旧的固定标记和裸 UID，且不访问 service-role 数据库', async () => {
    mocks.values.set(COOKIE_ADMIN, '1')
    mocks.values.set(COOKIE_PW, 'anything')
    mocks.values.set(COOKIE_UID, USER_ID)
    expect(await readAdminCookie()).toBe(false)
    expect(await readPwCookie()).toBe(false)
    expect(await getCurrentUser()).toBeNull()
    expect(mocks.db).not.toHaveBeenCalled()
    expect(await setCurrentSectionAction('lounge')).toEqual({ error: '未授权' })
    expect(mocks.db).not.toHaveBeenCalled()
  })

  it('合法登录签发凭据，并保留安全属性和活动过期时间', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await setAdminCookie()
    await setPwCookie()
    await setUidCookie(USER_ID)
    expect(await readAdminCookie()).toBe(true)
    expect(await readPwCookie()).toBe(true)
    expect(await readUidCookie()).toBe(USER_ID)
    for (const [name, value, options] of mocks.set.mock.calls) {
      expect(value).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
      expect(options).toEqual({
        httpOnly: true, sameSite: 'lax', secure: true, path: '/', expires: EXPIRES,
      })
      expect(name).toMatch(/^dams-/)
    }
  })

  it('篡改 UID 或到期时间后拒绝认证', async () => {
    await setUidCookie(USER_ID)
    const [version, payload, mac] = mocks.values.get(COOKIE_UID)!.split('.')
    const original = JSON.parse(Buffer.from(payload, 'base64url').toString())
    for (const altered of [
      { ...original, value: 'another-user-id' },
      { ...original, expiresAt: original.expiresAt + 86_400_000 },
    ]) {
      const changed = Buffer.from(JSON.stringify(altered)).toString('base64url')
      mocks.values.set(COOKIE_UID, `${version}.${changed}.${mac}`)
      expect(await getCurrentUser()).toBeNull()
    }
    expect(mocks.db).not.toHaveBeenCalled()
  })

  it('普通用户和活动准入凭据不能提升为管理员凭据', async () => {
    await setUidCookie(USER_ID)
    await setPwCookie()
    for (const name of [COOKIE_UID, COOKIE_PW]) {
      mocks.values.set(COOKIE_ADMIN, mocks.values.get(name)!)
      expect(await readAdminCookie()).toBe(false)
    }
    await setAdminCookie()
    mocks.values.set(COOKIE_UID, mocks.values.get(COOKIE_ADMIN)!)
    expect(await readUidCookie()).toBeNull()
  })

  it('服务端拒绝已过期凭据，即使请求方仍发送 Cookie', async () => {
    await setAdminCookie()
    await setPwCookie()
    await setUidCookie(USER_ID)
    vi.setSystemTime(EXPIRES)
    expect(await readAdminCookie()).toBe(false)
    expect(await readPwCookie()).toBe(false)
    expect(await getCurrentUser()).toBeNull()
    expect(mocks.db).not.toHaveBeenCalled()
  })

  it.each(['', 'too-short'])('缺失或过短密钥时拒绝读写凭据：%s', async (key) => {
    await setAdminCookie()
    vi.stubEnv('SESSION_SECRET', key)
    expect(await readAdminCookie()).toBe(false)
    mocks.set.mockClear()
    await expect(setAdminCookie()).rejects.toThrow('SESSION_SECRET')
    await expect(setPwCookie()).rejects.toThrow('SESSION_SECRET')
    await expect(setUidCookie(USER_ID)).rejects.toThrow('SESSION_SECRET')
    expect(mocks.set).not.toHaveBeenCalled()
  })

  it('轮换签名密钥后全部旧凭据失效', async () => {
    await setAdminCookie()
    await setPwCookie()
    await setUidCookie(USER_ID)
    vi.stubEnv('SESSION_SECRET', `${TEST_KEY}-rotated`)
    expect(await readAdminCookie()).toBe(false)
    expect(await readPwCookie()).toBe(false)
    expect(await readUidCookie()).toBeNull()
  })

  it.each(['v2.a.b', 'v1.a.short', 'v1.!.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'x'.repeat(2049)])(
    '格式错误的 Cookie 不抛异常也不授权：%s', async (token) => {
      mocks.values.set(COOKIE_ADMIN, token)
      expect(await readAdminCookie()).toBe(false)
    },
  )

  it('合法 UID 仅查询经过签名验证的用户', async () => {
    await setUidCookie(USER_ID)
    const user = { id: USER_ID }
    const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: user }) }))
    const from = vi.fn(() => ({ select: () => ({ eq }) }))
    mocks.db.mockReturnValue({ from })
    expect(await getCurrentUser()).toEqual(user)
    expect(from).toHaveBeenCalledWith('users')
    expect(eq).toHaveBeenCalledWith('id', USER_ID)
  })

  it('恢复流程仍需匹配恢复令牌，匹配后签发新凭据', async () => {
    let matched = false
    const eq = vi.fn().mockReturnThis()
    const query = { eq, maybeSingle: async () => ({ data: matched ? { id: USER_ID } : null }) }
    eq.mockImplementation(() => query)
    mocks.db.mockReturnValue({ from: () => ({ select: () => query }) })
    expect(await recoverUser(USER_ID, 'wrong-test-token')).toBeNull()
    expect(mocks.set).not.toHaveBeenCalled()
    matched = true
    expect(await recoverUser(USER_ID, 'valid-test-token')).toEqual({ id: USER_ID })
    expect(eq).toHaveBeenCalledWith('recovery_token', 'valid-test-token')
    expect(await readUidCookie()).toBe(USER_ID)
    expect(await readPwCookie()).toBe(true)
    expect(await readAdminCookie()).toBe(false)
  })

  it('退出会清除签名凭据', async () => {
    await setAdminCookie()
    await setPwCookie()
    await setUidCookie(USER_ID)
    await clearAllCookies()
    expect(mocks.values.size).toBe(0)
    expect(mocks.remove.mock.calls.map(([name]) => name)).toEqual([COOKIE_UID, COOKIE_PW, COOKIE_ADMIN])
  })
})
