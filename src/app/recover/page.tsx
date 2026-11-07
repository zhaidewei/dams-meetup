import Link from 'next/link'
import { LinkAdmission } from '@/components/meetup15/LinkAdmission'

export default function RecoverPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-5 py-12">
      <h1 className="text-2xl font-semibold">恢复第 15 期观众身份</h1>
      <LinkAdmission mode="recover" />
      <p>如果页面没有自动跳转，请检查链接是否来自本届「我」页面。</p>
      <Link className="underline" href="/">返回活动首页</Link>
    </main>
  )
}
