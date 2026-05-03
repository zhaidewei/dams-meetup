import { describe, expect, it } from 'vitest'
import { canonicalPair, isNonAnon } from './dm'

describe('canonicalPair', () => {
  it('orders by string comparison so the pair is symmetric', () => {
    const a = '11111111-1111-1111-1111-111111111111'
    const b = '22222222-2222-2222-2222-222222222222'
    expect(canonicalPair(a, b)).toEqual({ user_low: a, user_high: b })
    expect(canonicalPair(b, a)).toEqual({ user_low: a, user_high: b })
  })

  it('rejects self DM', () => {
    const a = '11111111-1111-1111-1111-111111111111'
    expect(() => canonicalPair(a, a)).toThrow()
  })
})

describe('isNonAnon', () => {
  it('user with nickname is non-anon', () => {
    expect(isNonAnon({ nickname: 'alice', is_vip: false })).toBe(true)
  })

  it('VIP without nickname is non-anon (fallback to vip_name)', () => {
    expect(isNonAnon({ nickname: null, is_vip: true })).toBe(true)
  })

  it('no nickname, not VIP -> anon', () => {
    expect(isNonAnon({ nickname: null, is_vip: false })).toBe(false)
  })
})
