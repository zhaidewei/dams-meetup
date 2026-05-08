'use server'

import { setOnbDismissed } from '@/lib/identity'

export async function dismissOnboardingAction() {
  await setOnbDismissed()
}
