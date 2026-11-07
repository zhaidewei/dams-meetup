import Link from 'next/link'
import { LinkAdmission } from '@/components/meetup15/LinkAdmission'

export default function RecoverPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-5 py-12">
      <h1 className="text-2xl font-semibold">恢复第 15 期观众身份</h1>
      <LinkAdmission mode="recover" />
      <p>请使用本届「我」页面保存的链接，并确认恢复身份。</p>
      <Link className="underline" href="/">返回活动首页</Link>
    </main>
  )
}
