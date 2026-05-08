import { readOnbDismissed } from '@/lib/identity'
import { OnboardingBannerInner } from './OnboardingBannerInner'

// SSR 直接判：cookie `dams-onb-v2` 已设 → 不渲染。
// 用 cookie 而非 localStorage 是因为 iOS Safari ITP 会清 7 天没交互的 localStorage，
// httpOnly Set-Cookie 不受影响。详见 src/lib/identity.ts COOKIE_ONB 注释。
export async function OnboardingBanner() {
  if (await readOnbDismissed()) return null
  return <OnboardingBannerInner />
}
