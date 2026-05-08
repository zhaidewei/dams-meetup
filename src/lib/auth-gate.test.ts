import { describe, it, expect } from 'vitest'
import { decideEntry, safeNext } from './auth-gate'

describe('safeNext', () => {
  it('accepts valid path-relative urls', () => {
    expect(safeNext('/feed')).toBe('/feed')
    expect(safeNext('/me')).toBe('/me')
    expect(safeNext('/feed?section=p1')).toBe('/feed?section=p1')
  })

  it('rejects protocol-relative urls (open redirect guard)', () => {
    expect(safeNext('//evil.com')).toBe('/feed')
    expect(safeNext('//evil.com/path')).toBe('/feed')
  })

  it('rejects absolute urls', () => {
    expect(safeNext('https://evil.com')).toBe('/feed')
    expect(safeNext('http://evil.com')).toBe('/feed')
  })

  it('rejects non-leading-slash strings', () => {
    expect(safeNext('feed')).toBe('/feed')
    expect(safeNext('')).toBe('/feed')
  })

  it('handles undefined / null', () => {
    expect(safeNext(undefined)).toBe('/feed')
    expect(safeNext(null)).toBe('/feed')
  })
})

describe('decideEntry', () => {
  describe('recovery URL (?u=&t=)', () => {
    it('takes priority over pw cookie', () => {
      const r = decideEntry({
        search: { u: 'uid-1', t: 'tok-1' },
        pwOk: true,
        userPresent: true,
      })
      expect(r).toEqual({ kind: 'recover', uid: 'uid-1', token: 'tok-1', next: null })
    })

    it('forwards next param', () => {
      const r = decideEntry({
        search: { u: 'uid-1', t: 'tok-1', next: '/me' },
        pwOk: false,
        userPresent: false,
      })
      expect(r).toEqual({ kind: 'recover', uid: 'uid-1', token: 'tok-1', next: '/me' })
    })

    it('only triggers when both u and t are present', () => {
      expect(
        decideEntry({ search: { u: 'uid-1' }, pwOk: false, userPresent: false }).kind,
      ).toBe('show-form')
      expect(
        decideEntry({ search: { t: 'tok-1' }, pwOk: false, userPresent: false }).kind,
      ).toBe('show-form')
    })
  })

  describe('redirect-loop防护：pw cookie 在但 user 不在', () => {
    it('returns show-form, NOT enter', () => {
      // 这是核心 regression test：旧逻辑只看 pwOk → 跳 /feed → /feed 看到
      // user=null 又跳 / → 307 死循环。
      const r = decideEntry({
        search: {},
        pwOk: true,
        userPresent: false,
      })
      expect(r).toEqual({ kind: 'show-form' })
    })

    it('still show-form when next is set (must not trust stale pw cookie)', () => {
      const r = decideEntry({
        search: { next: '/me' },
        pwOk: true,
        userPresent: false,
      })
      expect(r).toEqual({ kind: 'show-form' })
    })
  })

  describe('happy path：pw + user 双在', () => {
    it('enters feed by default', () => {
      const r = decideEntry({
        search: {},
        pwOk: true,
        userPresent: true,
      })
      expect(r).toEqual({ kind: 'enter', next: '/feed' })
    })

    it('respects safeNext for the `next` param', () => {
      expect(
        decideEntry({ search: { next: '/me' }, pwOk: true, userPresent: true }),
      ).toEqual({ kind: 'enter', next: '/me' })
      // open redirect attempt is sanitized
      expect(
        decideEntry({
          search: { next: '//evil.com' },
          pwOk: true,
          userPresent: true,
        }),
      ).toEqual({ kind: 'enter', next: '/feed' })
    })
  })

  describe('no pw cookie', () => {
    it('shows form regardless of userPresent', () => {
      expect(
        decideEntry({ search: {}, pwOk: false, userPresent: true }).kind,
      ).toBe('show-form')
      expect(
        decideEntry({ search: {}, pwOk: false, userPresent: false }).kind,
      ).toBe('show-form')
    })
  })
})
