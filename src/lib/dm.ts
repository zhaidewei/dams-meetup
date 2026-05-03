import type { UserRow } from './types'

// dm_threads 用 (user_low, user_high) 加 user_low < user_high 约束保证
// 一对用户只能存在一个 thread。所有插入/查找都要先把 (a, b) 规整成
// canonical 顺序。
export type CanonicalPair = { user_low: string; user_high: string }

export function canonicalPair(a: string, b: string): CanonicalPair {
  if (a === b) throw new Error('cannot DM yourself')
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a }
}

// "非匿名"=有自填昵称，或是嘉宾。决策来自 issue #6 用户答复 5：
// 匿名者既不能发起也不能回复 DM；嘉宾即使没填 nickname 也算非匿名
// （会 fallback 到 vip_name 显示）。
type NonAnonCheck = Pick<UserRow, 'nickname' | 'is_vip'>
export function isNonAnon(u: NonAnonCheck): boolean {
  return u.nickname !== null || u.is_vip
}
