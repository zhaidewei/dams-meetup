import { describe, it, expect } from 'vitest'
import { parseTags, MAX_TAGS } from './tags'

describe('parseTags', () => {
  it('returns empty array for empty / whitespace input', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags('   ')).toEqual([])
  })

  it('splits on spaces, commas (EN+CN), semicolons (EN+CN)', () => {
    expect(parseTags('ai ml,data，infra;cloud；devops')).toEqual([
      'ai',
      'ml',
      'data',
      'infra',
      'cloud',
    ])
  })

  it('strips leading # from each tag', () => {
    expect(parseTags('#ai #ml #data')).toEqual(['ai', 'ml', 'data'])
  })

  it('lowercases tags', () => {
    expect(parseTags('AI ML DataEng')).toEqual(['ai', 'ml', 'dataeng'])
  })

  it('dedupes case-insensitively', () => {
    expect(parseTags('ai AI Ai #ai')).toEqual(['ai'])
  })

  it(`caps result at ${MAX_TAGS} tags`, () => {
    const input = 'a b c d e f g h'
    expect(parseTags(input)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(parseTags(input)).toHaveLength(MAX_TAGS)
  })

  it('handles mixed separators with extra whitespace', () => {
    expect(parseTags('  ai , ,  ml  ;;  data  ')).toEqual(['ai', 'ml', 'data'])
  })

  it('preserves first-seen order after dedupe', () => {
    expect(parseTags('ml ai ml ai data')).toEqual(['ml', 'ai', 'data'])
  })
})
