// 集中"哪些操作需要非匿名身份"的判定。
// 设计原则：匿名（无昵称且非 VIP）= 只能看 + 点赞。一切"会被别人看到的发言"
// （发帖 / 提问 / 投票 / 回复 / 暗需求委托 / 被 AI 撮合作为推荐对象）都要先
// 填昵称。DM 的 gate 历来是 isNonAnon（dm.ts），这里把同一语义复用到写入路径，
// 保持 product 表述一致："想发言 → 先填昵称"。
//
// 服务端 gate 失败时返回 { ok:false, error }，由 action 透传给前端表单状态。

import { isNonAnon } from './dm'
import type { UserRow } from './types'

export const ANON_SPEAK_ERROR = '先填昵称才能发言（去「我」tab 点编辑身份）'

type SpeakerCheck = Pick<UserRow, 'nickname' | 'is_vip'>

export type GateResult = { ok: true } | { ok: false; error: string }

export function requireNonAnon(user: SpeakerCheck): GateResult {
  if (isNonAnon(user)) return { ok: true }
  return { ok: false, error: ANON_SPEAK_ERROR }
}
