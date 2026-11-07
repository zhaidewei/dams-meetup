export const MEETUP_NAME = '荷兰华人数据社群第 15 期 Meetup'
export const MEETUP_THEME = '荷兰华人的科技创业之路'
export const MEETUP_VENUE = 'TU Delft Echo Building, A3 Meeting Room'
export const MEETUP_ADDRESS = 'Van Mourik Broekmanweg 5, 2628 XE Delft'
export const INTERACTION_END = Date.parse('2026-11-21T18:00:00+01:00')

export function meetupPhase(now = Date.now()) {
  if (now >= INTERACTION_END) return 'closed'
  return now >= ADMISSION_END ? 'recovery' : 'event'
}

const EVENT_DAY = '2026-11-14'
const EVENT_OFFSET = '+01:00'
const EVENT_TIME_ZONE = 'Europe/Amsterdam'

export const MEETUP_SECTIONS = {
  lounge: '公共讨论区',
  lightning: '创业者 Lightning Talk',
  expert: '专家分享',
  breakout: '分组交流',
  panel: '圆桌讨论',
} as const

export type MeetupSection = keyof typeof MEETUP_SECTIONS

type AgendaSlot = {
  start: string
  end: string
  section: MeetupSection
  title: string
  details?: readonly string[]
}

export const MEETUP_AGENDA: readonly AgendaSlot[] = [
  {
    start: '12:45', end: '13:20', section: 'lounge',
    title: '签到 & Welcome Drink',
    details: ['签到、领取名牌及欢迎饮品'],
  },
  { start: '13:20', end: '13:30', section: 'lounge', title: '开场致辞' },
  {
    start: '13:30', end: '14:30', section: 'lightning',
    title: MEETUP_SECTIONS.lightning,
    details: [
      '侯胜任，CEO @ 任能科技',
      '方芳，Founder & Director @ FF Quant Advisory',
      '江少杰，Founder @ AI Colleagues',
      'Kiki Liu，CEO @ Twente Medical Optics',
      '许焕婕，Founder @ PrePlay',
      '徐宇迪，Managing Director @ 100things.nl',
      '张霁，Founder @ Arboretica',
      '朱颖，CEO @ Agri-AI / Decilogic',
    ],
  },
  {
    start: '14:30', end: '15:00', section: 'expert',
    title: '专家分享：创业路上最贵的两课——钱和法',
    details: [
      '《Tips for fundraising in Europe》——王婧昳，Strategy Director @ Prosus Ventures',
      '《Ask AI, or call the lawyer?》——彭湖湾，Legal Counsel @ TomTom',
    ],
  },
  {
    start: '15:00', end: '16:30', section: 'breakout',
    title: '分组交流 & 茶歇',
    details: [
      '银行、金融、量化与加密货币',
      '快消、物流与供应链',
      '传统制造与工业',
      '半导体与高精尖电子',
      '互联网、电商与旅游、SaaS',
      '能源、气候与公用事业',
      '咨询、自雇与创业',
      '学术研究与前沿实验室',
      '医学人工智能和生物信息应用',
    ],
  },
  {
    start: '16:30', end: '17:30', section: 'panel',
    title: '圆桌讨论：创业三问——想法、经验与专业',
    details: ['方芳、Kiki Liu、徐宇迪、张霁、王婧昳、彭湖湾'],
  },
  { start: '17:30', end: '18:00', section: 'lounge', title: '合影、闭幕、自由社交' },
]

function agendaTime(time: string) {
  return Date.parse(`${EVENT_DAY}T${time}:00${EVENT_OFFSET}`)
}

const firstSlot = MEETUP_AGENDA[0]
const lastSlot = MEETUP_AGENDA[MEETUP_AGENDA.length - 1]
const eventDate = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: EVENT_TIME_ZONE,
}).format(agendaTime(firstSlot.start))

export const MEETUP_DATE = `${eventDate} ${firstSlot.start}–${lastSlot.end} CET`
export const ADMISSION_END = agendaTime(lastSlot.end)

export function meetupSectionAt(now = Date.now()): MeetupSection {
  return MEETUP_AGENDA.find(({ start, end }) => agendaTime(start) <= now && now < agendaTime(end))
    ?.section ?? 'lounge'
}

export function isMeetupSection(value: unknown): value is MeetupSection {
  return typeof value === 'string' && Object.hasOwn(MEETUP_SECTIONS, value)
}

export function nextMeetupSectionChange(now: number): number | null {
  for (const slot of MEETUP_AGENDA) {
    for (const time of [slot.start, slot.end]) {
      const boundary = agendaTime(time)
      if (boundary > now && meetupSectionAt(boundary - 1) !== meetupSectionAt(boundary)) return boundary
    }
  }
  return null
}
