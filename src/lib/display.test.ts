import { describe, it, expect } from 'vitest'
import { displayName, displayMeta, type DisplayUser } from './display'

const base: DisplayUser = {
  nickname: null,
  company: null,
  is_vip: false,
  vip_name: null,
  vip_title: null,
}

describe('displayName', () => {
  it('uses self-edited nickname when present', () => {
    expect(displayName({ ...base, nickname: '小明' })).toBe('小明')
  })

  it('VIP without nickname falls back to vip_name', () => {
    expect(displayName({ ...base, is_vip: true, vip_name: '张教授' })).toBe('张教授')
  })

  it('VIP nickname overrides vip_name', () => {
    expect(
      displayName({ ...base, is_vip: true, nickname: '老张', vip_name: '张教授' }),
    ).toBe('老张')
  })

  it('VIP without nickname or vip_name falls back to 嘉宾', () => {
    expect(displayName({ ...base, is_vip: true })).toBe('嘉宾')
  })

  it('non-VIP without nickname is 匿名', () => {
    expect(displayName(base)).toBe('匿名')
  })

  it('empty-string nickname is treated as a real value (no coercion)', () => {
    // 与代码契约一致：null 才走 fallback；空串由 server action 在写入前 trim 成 null
    expect(displayName({ ...base, nickname: '' })).toBe('')
  })
})

describe('displayMeta', () => {
  it('uses self-edited company when present', () => {
    expect(displayMeta({ ...base, company: 'Acme' })).toBe('Acme')
  })

  it('VIP without company falls back to vip_title', () => {
    expect(displayMeta({ ...base, is_vip: true, vip_title: 'CTO' })).toBe('CTO')
  })

  it('VIP company overrides vip_title', () => {
    expect(
      displayMeta({ ...base, is_vip: true, company: 'NewCo', vip_title: 'CTO' }),
    ).toBe('NewCo')
  })

  it('non-VIP without company returns null', () => {
    expect(displayMeta(base)).toBeNull()
  })

  it('VIP without company or vip_title returns null', () => {
    expect(displayMeta({ ...base, is_vip: true })).toBeNull()
  })
})
