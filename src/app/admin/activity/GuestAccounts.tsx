import Link from 'next/link'
import { meetupEnv } from '@/lib/meetup15/server'
import { COMPANY_FIELD } from '@/lib/meetup15/personal'

type GuestAccount = { username: string; displayName: string; title: string | null; company: string | null }

export async function GuestAccounts({ edit, status }: { edit?: string; status?: string }) {
  const { results: guests } = await meetupEnv().ACTIVITY_DB.prepare(
    `SELECT username, display_name AS displayName, title, json_extract(public_profile, '$.company') AS company
     FROM meetup15_members WHERE role = 'guest' ORDER BY display_name, username`,
  ).all<GuestAccount>()
  const editing = guests.find(guest => guest.username === edit)

  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section id="guest-account" aria-labelledby="guest-account-heading" className="scroll-mt-4 space-y-3 rounded-2xl border border-dams-line bg-white p-4">
        <h1 id="guest-account-heading" className="text-lg font-semibold">{editing ? '修改嘉宾账号' : '新增嘉宾账号'}</h1>
        <p className="text-sm text-zinc-600">{editing ? '可以修改姓名、职位和工作单位，或设置新密码。' : '新增嘉宾时需要设置初始密码。'}</p>
        {status === 'saved' && <p role="status">嘉宾账号已保存。</p>}
        {status === 'duplicate' && <p role="alert">该用户名已登记，请从名单中选择要修改的嘉宾。</p>}
        {status === 'invalid' && <p role="alert">请检查用户名、姓名和密码要求。</p>}
        <form key={editing?.username ?? 'new'} method="post" action="/api/meetup/guests" className="space-y-3">
          <input type="hidden" name="action" value={editing ? 'edit' : 'create'} />
          <label className="block text-sm">
            用户名
            <input name="username" defaultValue={editing?.username} readOnly={Boolean(editing)} autoComplete="off" minLength={3} maxLength={32}
              pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,31}" required
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
          </label>
          <p className="text-xs text-zinc-600">3–32 位字母、数字、点、下划线或连字符。</p>
          <label className="block text-sm">
            姓名
            <input name="displayName" defaultValue={editing?.displayName} required maxLength={80}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            职位
            <input name="title" defaultValue={editing?.title ?? ''} maxLength={120}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            工作单位
            <input name="company" defaultValue={editing?.company ?? ''} maxLength={COMPANY_FIELD.maxLength}
              autoComplete={COMPANY_FIELD.autoComplete} className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            {editing ? '新密码（选填）' : '嘉宾密码'}
            <input name="password" type="password" minLength={12} maxLength={128}
              required={!editing} autoComplete="new-password"
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2" />
          </label>
          <p className="text-xs text-zinc-600">至少 12 个字符，请通过私下渠道交给嘉宾。</p>
          <button className="min-h-11 rounded-full bg-dams-blue px-5 py-2 text-white">保存嘉宾账号</button>
        </form>
        {editing && <Link className="inline-flex min-h-11 items-center text-sm text-dams-hover underline" href="/admin/activity?tab=guests">返回新增</Link>}
      </section>
      <section aria-labelledby="registered-guests" className="space-y-3 rounded-2xl border border-dams-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="registered-guests" className="text-lg font-semibold">已登记嘉宾</h2>
          <p className="text-sm text-slate-600">{guests.length} 位</p>
        </div>
        {guests.length ? (
          <ul className="divide-y divide-dams-line">
            {guests.map(guest => (
              <li key={guest.username} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{guest.displayName}</p>
                  <p className="break-all text-sm text-slate-700">{guest.username}</p>
                  {(guest.title || guest.company) && (
                    <p className="break-words text-sm text-slate-600">{[guest.title, guest.company].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                <Link href={`/admin/activity?tab=guests&edit=${encodeURIComponent(guest.username)}#guest-account`}
                  aria-label={`修改 ${guest.displayName}（${guest.username}）`}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-dams-hover hover:bg-dams-wash">
                  修改
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-600">暂无已登记嘉宾。</p>}
      </section>
    </div>
  )
}
