// 4 event sections — splits the timeline into separate discussion streams.
// Backend stores `posts.section` (text, nullable). Constraint in 0005.

export const SECTIONS = [
  { id: 'p1', label: '演讲 1' },
  { id: 'p2', label: '演讲 2' },
  { id: 'breakout', label: '分组交流' },
  { id: 'panel', label: '圆桌讨论' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export const DEFAULT_SECTION: SectionId = 'p1'

const SECTION_IDS = SECTIONS.map((s) => s.id) as readonly string[]

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === 'string' && SECTION_IDS.includes(value)
}

export function sectionLabel(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)!.label
}
