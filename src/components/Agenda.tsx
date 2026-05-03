type AgendaItem = {
  time: string
  title: string
  talks?: { topic: string; speaker: string; affiliation: string }[]
  sponsors?: { label: string; name: string }[]
  panelists?: { name: string; role: string }[]
}

const AGENDA: AgendaItem[] = [
  { time: '12:45 – 13:20', title: '签到、领取名牌及欢迎饮品' },
  { time: '13:20 – 13:30', title: '开场致辞' },
  {
    time: '13:30 – 14:30',
    title: '主题演讲',
    talks: [
      {
        topic: '和 AI 搭档：合作、摩擦与重新定义工作',
        speaker: '刘爵铭',
        affiliation: 'Senior Applied Scientist @ Uber',
      },
      {
        topic: 'AI 背景下的技术研究：我们应该和可以干什么',
        speaker: '杨杰',
        affiliation: 'Assistant Professor @ TU Delft',
      },
    ],
  },
  {
    time: '14:30 – 14:45',
    title: '赞助商 & 合作协会宣讲',
    sponsors: [
      { label: '赞助商', name: '腾讯 (Tencent)' },
      { label: '合作协会', name: '荷兰华人学者与工程师协会' },
    ],
  },
  { time: '14:45 – 15:30', title: '分组交流 & 茶歇' },
  {
    time: '15:30 – 17:20',
    title: '圆桌讨论：AI 浪潮下数据人何去何从',
    panelists: [
      { name: '葛怡', role: 'Project Lead @ ASML' },
      { name: '张霁', role: 'Founder @ Arboretica' },
      { name: '杨杰', role: 'Assistant Professor @ TU Delft' },
      { name: '杨开涛', role: 'VP of Machine Learning @ Epicore Biosystems' },
      { name: '翟德炜', role: 'Founder @ Dewei Consulting B.V.' },
      { name: '祖彬', role: 'Senior Manager Demand Planning @ PVH' },
    ],
  },
  { time: '17:20 – 18:00', title: '幸运抽奖、合影、自由社交' },
]

export function Agenda() {
  return (
    <section aria-label="活动议程" className="space-y-4">
      <h2 className="text-center text-sm font-medium tracking-wide text-zinc-500">
        活动议程 · 2026-05-09
      </h2>
      <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
        {AGENDA.map((item) => (
          <li key={item.time} className="grid grid-cols-[7rem_1fr] gap-4 px-4 py-3 sm:px-5">
            <span className="text-sm tabular-nums text-zinc-500">{item.time}</span>
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-900">{item.title}</p>
              {item.talks && (
                <ul className="space-y-1.5">
                  {item.talks.map((t) => (
                    <li key={t.topic} className="text-sm text-zinc-700">
                      <span>{t.topic}</span>
                      <span className="text-zinc-500"> — {t.speaker}，{t.affiliation}</span>
                    </li>
                  ))}
                </ul>
              )}
              {item.sponsors && (
                <ul className="space-y-1 text-sm text-zinc-700">
                  {item.sponsors.map((s) => (
                    <li key={s.name}>
                      <span className="text-zinc-500">{s.label}：</span>
                      {s.name}
                    </li>
                  ))}
                </ul>
              )}
              {item.panelists && (
                <ul className="space-y-1 text-sm text-zinc-700">
                  {item.panelists.map((p) => (
                    <li key={p.name}>
                      {p.name}
                      <span className="text-zinc-500">，{p.role}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
