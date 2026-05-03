'use server'

import { redirect } from 'next/navigation'
import { clearAllCookies } from '@/lib/identity'

export async function logoutAction() {
  await clearAllCookies()
  redirect('/')
}
