import { describe, it, expect } from 'vitest'
import { isSectionId, sectionLabel, SECTIONS, DEFAULT_SECTION } from './sections'

describe('isSectionId', () => {
  it.each(SECTIONS.map((s) => s.id))('accepts known id %s', (id) => {
    expect(isSectionId(id)).toBe(true)
  })

  it('rejects unknown strings', () => {
    expect(isSectionId('p3')).toBe(false)
    expect(isSectionId('')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isSectionId(null)).toBe(false)
    expect(isSectionId(undefined)).toBe(false)
    expect(isSectionId(1)).toBe(false)
    expect(isSectionId({})).toBe(false)
  })
})

describe('sectionLabel', () => {
  it.each(SECTIONS)('returns label for $id', ({ id, label }) => {
    expect(sectionLabel(id)).toBe(label)
  })

  it('DEFAULT_SECTION is a valid id', () => {
    expect(isSectionId(DEFAULT_SECTION)).toBe(true)
    expect(sectionLabel(DEFAULT_SECTION)).toBeTruthy()
  })
})
