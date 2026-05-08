import { describe, expect, it } from 'vitest'
import { ANON_SPEAK_ERROR, requireNonAnon } from './permissions'

describe('requireNonAnon', () => {
  it('允许有昵称的普通用户发言', () => {
    expect(requireNonAnon({ nickname: 'alice', is_vip: false })).toEqual({ ok: true })
  })

  it('允许 VIP（即使无昵称，会 fallback 到 vip_name 显示）', () => {
    expect(requireNonAnon({ nickname: null, is_vip: true })).toEqual({ ok: true })
  })

  it('允许同时有昵称且是 VIP', () => {
    expect(requireNonAnon({ nickname: 'host', is_vip: true })).toEqual({ ok: true })
  })

  it('阻止匿名（无昵称 + 非 VIP）并返回中文 error', () => {
    const r = requireNonAnon({ nickname: null, is_vip: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe(ANON_SPEAK_ERROR)
  })

  it('error 文案提到「昵称」和「我」tab，便于用户自助', () => {
    expect(ANON_SPEAK_ERROR).toMatch(/昵称/)
    expect(ANON_SPEAK_ERROR).toMatch(/我/)
  })
})
