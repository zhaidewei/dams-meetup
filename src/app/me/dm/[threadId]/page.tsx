import { redirect } from 'next/navigation'

export default function ArchivedThreadPage() {
  redirect('/me?view=messages')
}
