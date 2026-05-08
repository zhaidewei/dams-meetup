// 首页 `/` 的进入决策。抽成纯函数让 UT 直接覆盖 redirect loop 防护
// （pw cookie 在但 users 行不在时绝不能跳 /feed）。

export type EntryDecision =
  | { kind: 'recover'; uid: string; token: string; next: string | null }
  | { kind: 'enter'; next: string }
  | { kind: 'show-form' }

export type EntryInput = {
  search: { u?: string; t?: string; next?: string }
  pwOk: boolean
  // 仅当 pwOk=true 时才需要查 DB；pwOk=false 时此字段可任意值（被忽略）。
  userPresent: boolean
}

export function decideEntry(input: EntryInput): EntryDecision {
  const { search, pwOk, userPresent } = input

  // recovery URL 优先级最高 — 即便有 pw cookie 也走 recover 让它刷新 uid。
  if (search.u && search.t) {
    return {
      kind: 'recover',
      uid: search.u,
      token: search.t,
      next: search.next ?? null,
    }
  }

  // pw + user 都在 → 进 feed。pw 在但 user 不在时绝不能跳 feed，
  // 否则 /feed 又会跳回 / 形成 307 死循环。
  if (pwOk && userPresent) {
    return { kind: 'enter', next: safeNext(search.next) }
  }

  return { kind: 'show-form' }
}

// 防 open redirect：next 必须是 '/' 开头且不是 '//'（协议相对 URL）。
export function safeNext(next: string | undefined | null): string {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    return next
  }
  return '/feed'
}
