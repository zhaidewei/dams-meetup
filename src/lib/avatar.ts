// 极简头像：缩写 + hash 出来的背景色。
// 设计目标：meetup 现场扫一眼区分用户，不靠真头像。
//
// 缩写规则：
//   中文名 → 取首字
//   拉丁名 → 取前两位字母大写
//   匿名 → 「匿」
// 颜色：uuid hash 在固定 6 色中选一个，匿名用户也彼此色相不同。

type AvatarUser = {
  nickname: string | null
  is_vip: boolean
  vip_name: string | null
}

const PALETTE = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-cyan-600',
] as const

export function avatarInitial(u: AvatarUser): string {
  const raw = u.nickname ?? u.vip_name
  const name = raw?.trim()
  if (!name) return '匿'
  const c = name[0]!
  // 中日韩 unified ideographs → 一个字
  if (/[㐀-鿿]/.test(c)) return c
  // 拉丁字母：取前两位（去掉非字母）
  const letters = name.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 2) return (letters[0] + letters[1]).toUpperCase()
  if (letters.length === 1) return letters[0]!.toUpperCase()
  return c
}

export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return PALETTE[h % PALETTE.length]!
}
