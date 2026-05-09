import type { SectionId } from '@/lib/sections'

export type Talk = {
  topic: string
  speaker: string
  affiliation: string
  sectionId?: SectionId
}

export type Sponsor = { label: string; name: string; italic?: string; url?: string }
export type Panelist = { name: string; role: string }

export type AgendaItem = {
  time: string
  title: string
  sectionId?: SectionId
  talks?: Talk[]
  sponsors?: Sponsor[]
  panelists?: Panelist[]
  startIso?: string
  endIso?: string
}

export const AGENDA: AgendaItem[] = [
  {
    time: '12:45 – 13:20',
    title: '签到、领取名牌及欢迎饮品',
    startIso: '2026-05-09T12:45:00+02:00',
    endIso: '2026-05-09T13:20:00+02:00',
  },
  {
    time: '13:20 – 13:30',
    title: '开场致辞',
    startIso: '2026-05-09T13:20:00+02:00',
    endIso: '2026-05-09T13:30:00+02:00',
  },
  {
    time: '13:30 – 14:30',
    title: '主题演讲',
    startIso: '2026-05-09T13:30:00+02:00',
    endIso: '2026-05-09T14:30:00+02:00',
    talks: [
      {
        topic: '和 AI 搭档：合作、摩擦与重新定义工作',
        speaker: '刘爵铭',
        affiliation: 'Senior Applied Scientist @ Uber',
        sectionId: 'p1',
      },
      {
        topic: 'AI 背景下的技术研究：我们应该和可以干什么',
        speaker: '杨杰',
        affiliation: 'Assistant Professor @ TU Delft',
        sectionId: 'p2',
      },
    ],
  },
  {
    time: '14:30 – 14:45',
    title: '赞助商 & 协办方宣讲',
    startIso: '2026-05-09T14:30:00+02:00',
    endIso: '2026-05-09T14:45:00+02:00',
    sponsors: [
      { label: '赞助商', name: '腾讯', italic: 'Tencent', url: 'https://www.tencent.com' },
      {
        label: '协办',
        name: 'VCWI 荷兰华人学者与工程师协会',
        url: 'https://vcwi.nl/en/elementor-2835/',
      },
    ],
  },
  {
    time: '14:45 – 15:45',
    title: '分组交流 & 茶歇',
    sectionId: 'breakout',
    startIso: '2026-05-09T14:45:00+02:00',
    endIso: '2026-05-09T15:45:00+02:00',
  },
  {
    time: '15:45 – 17:20',
    title: '圆桌讨论：AI 浪潮下数据人何去何从',
    sectionId: 'panel',
    startIso: '2026-05-09T15:45:00+02:00',
    endIso: '2026-05-09T17:20:00+02:00',
    panelists: [
      { name: '葛怡', role: 'Project Lead @ ASML' },
      { name: '张霁', role: 'Founder @ Arboretica' },
      { name: '杨杰', role: 'Assistant Professor @ TU Delft' },
      { name: '杨开涛', role: 'VP of Machine Learning @ Epicore Biosystems' },
      { name: '翟德炜', role: 'Founder @ Dewei Consulting B.V.' },
      { name: '祖彬', role: 'Senior Manager Demand Planning @ PVH' },
    ],
  },
  {
    time: '17:20 – 18:00',
    title: '幸运抽奖、合影、自由社交',
    startIso: '2026-05-09T17:20:00+02:00',
    endIso: '2026-05-09T18:00:00+02:00',
  },
]

// 当前时间属于第几行（用于大屏高亮），不命中返回 -1
export function agendaRowByClock(now: Date = new Date()): number {
  const t = now.getTime()
  for (let i = 0; i < AGENDA.length; i++) {
    const item = AGENDA[i]
    if (!item.startIso || !item.endIso) continue
    if (t >= Date.parse(item.startIso) && t < Date.parse(item.endIso)) return i
  }
  return -1
}

// 下一个尚未开始的行（用于大屏 "下一个板块" 提示），全部已结束返回 -1
export function nextAgendaRow(now: Date = new Date()): number {
  const t = now.getTime()
  for (let i = 0; i < AGENDA.length; i++) {
    const item = AGENDA[i]
    if (!item.startIso) continue
    if (t < Date.parse(item.startIso)) return i
  }
  return -1
}
