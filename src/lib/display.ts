// Single source of truth for how a user's name + meta render in posts/replies.
//
// VIP self-edited nickname/company override the organizer-preset
// vip_name/vip_title. If a VIP leaves nickname/company blank, we fall back
// to the preset. Non-VIP users: nickname or "匿名"; company or null.
//
// The shape is structural so it matches PostAuthor / ReplyAuthorMini /
// MentionAuthor without forcing every call site to import the same type.

export type DisplayUser = {
  nickname: string | null
  company?: string | null
  is_vip: boolean
  vip_name: string | null
  vip_title?: string | null
}

export function displayName(u: DisplayUser): string {
  return u.nickname ?? (u.is_vip ? u.vip_name ?? '嘉宾' : '匿名')
}

export function displayMeta(u: DisplayUser): string | null {
  return u.company ?? (u.is_vip ? u.vip_title ?? null : null)
}
