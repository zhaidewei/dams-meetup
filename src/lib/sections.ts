// Event sections — splits the timeline into separate discussion streams.
// Backend stores `posts.section` (text, nullable). Constraint in 0005 + 0018.
// `lounge` 是脱离会议议程的公共讨论区，没有时间窗，永远开放；放第一位。

export const SECTIONS = [
  { id: 'lounge', label: '公共讨论区' },
  { id: 'p1', label: '演讲 1' },
  { id: 'p2', label: '演讲 2' },
  { id: 'breakout', label: '分组交流' },
  { id: 'panel', label: '圆桌讨论' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export const DEFAULT_SECTION: SectionId = 'lounge'

const SECTION_IDS = SECTIONS.map((s) => s.id) as readonly string[]

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === 'string' && SECTION_IDS.includes(value)
}

export function sectionLabel(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)!.label
}

// 议程时间表（与 src/components/Agenda.tsx 内容对齐）：把每个板块映射到一个时间窗。
// 时间用 Europe/Amsterdam，与 NEXT_PUBLIC_EVENT_START / END 一致。
// 用于：(1) getCurrentSection() 在没有覆写时的回落；(2) 板块上下文条显示当前讲者（issue #18 C）。
export type SectionWindow = {
  id: SectionId
  startIso: string
  endIso: string
}

export const SECTION_WINDOWS: SectionWindow[] = [
  { id: 'p1', startIso: '2026-05-09T13:30:00+02:00', endIso: '2026-05-09T14:00:00+02:00' },
  { id: 'p2', startIso: '2026-05-09T14:00:00+02:00', endIso: '2026-05-09T14:30:00+02:00' },
  { id: 'breakout', startIso: '2026-05-09T14:45:00+02:00', endIso: '2026-05-09T15:45:00+02:00' },
  { id: 'panel', startIso: '2026-05-09T15:45:00+02:00', endIso: '2026-05-09T17:20:00+02:00' },
]

// 板块上下文：用于 SectionTabs 下方的「演讲 1 · 13:30–14:30 · 刘爵铭：和 AI 搭档」一行（issue #18 C）。
// 与 Agenda.tsx 里的 talks/panelists 含义重合，但数据职责不同（Agenda 含签到、赞助商等非板块项），
// 暂不做物理统一。如未来要去重，把 Agenda 也搬来读这里即可。
export type SectionMeta = {
  topic: string
  speaker: string | null
  affiliation: string | null
}

export const SECTION_META: Record<SectionId, SectionMeta> = {
  lounge: {
    topic: '不限主题，自由发帖、求助、组队、招聘',
    speaker: null,
    affiliation: null,
  },
  p1: {
    topic: '和 AI 搭档：合作、摩擦与重新定义工作',
    speaker: '刘爵铭',
    affiliation: 'Senior Applied Scientist @ Uber',
  },
  p2: {
    topic: 'AI 背景下的技术研究：我们应该和可以干什么',
    speaker: '杨杰',
    affiliation: 'Assistant Professor @ TU Delft',
  },
  breakout: {
    topic: '分组交流 & 茶歇',
    speaker: null,
    affiliation: null,
  },
  panel: {
    topic: 'AI 浪潮下数据人何去何从',
    speaker: '6 位嘉宾圆桌',
    affiliation: null,
  },
}

// 板块时间窗的人类可读区间，例 "13:30–14:30"。
export function sectionTimeRange(id: SectionId): string {
  const w = SECTION_WINDOWS.find((x) => x.id === id)
  if (!w) return ''
  return `${formatHM(w.startIso)}–${formatHM(w.endIso)}`
}

function formatHM(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Amsterdam',
  })
}

// 纯时间驱动：当前时间落在哪个板块窗口里。命中即返回该 section；不命中（空档期 / 活动外）返回 null。
export function sectionByClock(now: Date = new Date()): SectionId | null {
  const t = now.getTime()
  for (const w of SECTION_WINDOWS) {
    if (t >= Date.parse(w.startIso) && t < Date.parse(w.endIso)) return w.id
  }
  return null
}
