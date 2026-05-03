import { redirect } from 'next/navigation'
import { ensureUser, readPwCookie, setPwCookie } from '@/lib/identity'
import { EVENT_NAME, EVENT_ORGANIZER } from '@/lib/constants'

type SearchParams = Promise<{
  u?: string
  t?: string
  error?: string
  next?: string
}>

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams

  // Recovery flow: ?u=<uuid>&t=<token> — delegate to /recover route handler.
  // (Cookie writes are not allowed in Server Components.)
  if (sp.u && sp.t) {
    const qs = new URLSearchParams({ u: sp.u, t: sp.t })
    if (sp.next) qs.set('next', sp.next)
    redirect(`/recover?${qs.toString()}`)
  }

  // Already authed → straight to feed
  if (await readPwCookie()) {
    redirect(safeNext(sp.next))
  }

  const showError = sp.error === '1'
  const recoveryFailed = sp.error === 'recovery'

  return (
    <main className="flex min-h-svh flex-col items-center px-6 py-12">
      <div className="w-full max-w-2xl space-y-10">
        <header className="space-y-1 text-center">
          <p className="text-sm text-zinc-500">{EVENT_ORGANIZER}</p>
          <h1 className="text-2xl font-semibold">{EVENT_NAME}</h1>
        </header>

        <div className="mx-auto w-full max-w-sm space-y-6">
          <form action={loginAction} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm text-zinc-700 mb-1.5">
                活动密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
                autoComplete="off"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {showError && <p className="mt-2 text-sm text-red-600">密码不对</p>}
              {recoveryFailed && (
                <p className="mt-2 text-sm text-amber-600">恢复链接已失效，请输入活动密码进入</p>
              )}
            </div>

            <input type="hidden" name="next" value={sp.next ?? ''} />

            <button
              type="submit"
              className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              进入
            </button>
          </form>

          <p className="text-center text-xs text-zinc-400">
            密码请看现场幻灯片，或问主办方
          </p>

          <p className="text-center text-xs text-zinc-500">
            嘉宾请走
            <a href="/vip-login" className="ml-1 underline">
              嘉宾登录
            </a>
          </p>
        </div>

        <Agenda />
      </div>
    </main>
  )
}

function Agenda() {
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

function safeNext(next: string | undefined) {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return next
  }
  return '/feed'
}

async function loginAction(formData: FormData) {
  'use server'
  const password = formData.get('password')
  const next = formData.get('next')
  const expected = process.env.EVENT_PASSWORD

  if (!expected || typeof password !== 'string' || password !== expected) {
    redirect('/?error=1')
  }

  await setPwCookie()
  await ensureUser()
  redirect(safeNext(typeof next === 'string' ? next : undefined))
}
