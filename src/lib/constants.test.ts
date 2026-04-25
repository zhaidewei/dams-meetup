import { describe, it, expect } from 'vitest'
import {
  EVENT_END_ISO,
  RECOVERY_WINDOW_DAYS,
  POST_MAX_CHARS,
  REPLY_MAX_CHARS,
  POLL_MIN_OPTIONS,
  POLL_MAX_OPTIONS,
  cookieExpiresAt,
} from './constants'

describe('cookieExpiresAt', () => {
  it('returns RECOVERY_WINDOW_DAYS days after EVENT_END_ISO', () => {
    const expiresAt = cookieExpiresAt()
    const eventEnd = Date.parse(EVENT_END_ISO)
    expect(expiresAt.getTime() - eventEnd).toBe(RECOVERY_WINDOW_DAYS * 86_400_000)
  })

  it('returns a finite Date', () => {
    const d = cookieExpiresAt()
    expect(d).toBeInstanceOf(Date)
    expect(Number.isFinite(d.getTime())).toBe(true)
  })

  it('is in the future relative to event start', () => {
    expect(cookieExpiresAt().getTime()).toBeGreaterThan(Date.parse(EVENT_END_ISO))
  })
})

describe('post / reply / poll constraints', () => {
  // 与 supabase/migrations/0001_schema.sql 的 char_length / 选项数量保持一致
  it('POST_MAX_CHARS aligns with posts.body check (300)', () => {
    expect(POST_MAX_CHARS).toBe(300)
  })

  it('REPLY_MAX_CHARS aligns with replies.body check (300)', () => {
    expect(REPLY_MAX_CHARS).toBe(300)
  })

  it('poll option count bounds are sensible', () => {
    expect(POLL_MIN_OPTIONS).toBeGreaterThanOrEqual(2)
    expect(POLL_MAX_OPTIONS).toBeLessThanOrEqual(10)
    expect(POLL_MIN_OPTIONS).toBeLessThan(POLL_MAX_OPTIONS)
  })

  it('RECOVERY_WINDOW_DAYS is positive', () => {
    expect(RECOVERY_WINDOW_DAYS).toBeGreaterThan(0)
  })
})
