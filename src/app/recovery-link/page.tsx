import { redirect } from 'next/navigation'

export default function RecoveryLinkPage() {
  redirect('/me?view=recovery')
}
