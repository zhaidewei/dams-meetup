import { avatarInitial, avatarColor } from '@/lib/avatar'

type Props = {
  // 用于 hash 出颜色，通常是 user.id（uuid）。匿名用户也彼此不同色相。
  seed: string
  user: {
    nickname: string | null
    is_vip: boolean
    vip_name: string | null
  }
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  // 暗背景下使用（如 /screen），文字仍是白色但 ring 色变深。
  onDark?: boolean
}

const SIZE_CLS: Record<NonNullable<Props['size']>, string> = {
  xs: 'size-5 text-[10px]',
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-11 text-base',
  xl: 'size-16 text-2xl',
}

export function Avatar({ seed, user, size = 'md', onDark = false }: Props) {
  const initial = avatarInitial(user)
  const color = avatarColor(seed)
  const ringCls = onDark ? 'ring-1 ring-zinc-700' : 'ring-1 ring-white/40'
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${color} ${SIZE_CLS[size]} ${ringCls}`}
    >
      {initial}
    </span>
  )
}
