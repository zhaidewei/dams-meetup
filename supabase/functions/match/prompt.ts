// 纯函数：把候选帖子 + 全场画像组装成 LLM 输入。
// 抽出来便于本地单测（不依赖 Deno / Supabase 环境）。

// 把文本里常见的个人联系方式（邮箱 / URL / 长数字串）换成 [已隐藏]，
// 避免随 prompt 发到 DeepSeek。最后一道防线 —— 用户已被提示不要写，
// 但写错了时这里兜底。不做手机号 / 微信号的精确匹配（误伤率太高），
// 用"≥10 位连续数字"覆盖手机/QQ；微信号继续靠 UI 提示。
function redactContacts(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[已隐藏]')
    .replace(/https?:\/\/\S+/gi, '[已隐藏]')
    .replace(/\d{10,}/g, '[已隐藏]')
}

export type CandidatePost = {
  id: number
  body: string
  tags: string[] | null
  section: string | null
  user_id: string
  match_intent: string
}

export type UserProfile = {
  user_id: string
  display_name: string
  affiliation: string | null
  // 用户在 /me 私下写的「我能提供什么」（migration 0023）。仅 AI 可见，
  // 在 prompt 里以独立段落呈现，让 LLM 区分公开帖（被动观察）与自我声明
  // （主动委托）。redactContacts 兜底个人联系方式。
  match_offer: string | null
  posts: Array<{ body: string; tags: string[] | null; section: string | null }>
}

const SECTION_LABEL: Record<string, string> = {
  p1: 'Presentation 1',
  p2: 'Presentation 2',
  breakout: 'Breakout',
  panel: 'Panel',
}

function labelSection(s: string | null): string {
  return s ? SECTION_LABEL[s] ?? s : 'Pre-event'
}

export function buildPrompt(args: {
  candidates: CandidatePost[]
  profiles: UserProfile[]
}): string {
  const lines: string[] = []

  lines.push('## 需要匹配的 candidate 帖子（含暗需求，仅你可见）')
  lines.push('')
  for (const c of args.candidates) {
    lines.push(`### post_id=${c.id}`)
    lines.push(`作者 user_id=${c.user_id} | 板块: ${labelSection(c.section)}`)
    lines.push(`公开内容: ${redactContacts(c.body)}`)
    if (c.tags?.length) lines.push(`tags: ${c.tags.join(', ')}`)
    lines.push(`暗需求: ${redactContacts(c.match_intent)}`)
    lines.push('')
  }

  lines.push('## 全场用户画像（按公开帖聚合）')
  lines.push('')
  for (const p of args.profiles) {
    const head = p.affiliation ? `${p.display_name} · ${p.affiliation}` : p.display_name
    lines.push(`### user_id=${p.user_id} | ${head}`)
    if (p.match_offer) {
      lines.push(`自我介绍（用户私下委托 AI 引用）: ${redactContacts(p.match_offer)}`)
    }
    for (const post of p.posts.slice(0, 5)) {
      const tags = post.tags?.length ? ` [${post.tags.join(',')}]` : ''
      const redacted = redactContacts(post.body)
      const snippet = redacted.length > 120 ? redacted.slice(0, 120) + '…' : redacted
      lines.push(`- [${labelSection(post.section)}]${tags} ${snippet}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export type RawPostWithUser = {
  user_id: string | null
  body: string
  tags: string[] | null
  section: string | null
  users: {
    id: string
    nickname: string | null
    company: string | null
    is_vip: boolean
    vip_name: string | null
    vip_title: string | null
    match_offer: string | null
  } | null
}

export function aggregateProfiles(rows: RawPostWithUser[]): UserProfile[] {
  const map = new Map<string, UserProfile>()
  for (const row of rows) {
    if (!row.user_id || !row.users) continue
    let profile = map.get(row.user_id)
    if (!profile) {
      const u = row.users
      const display = u.is_vip ? u.vip_name ?? '嘉宾' : u.nickname ?? '匿名'
      const aff = u.is_vip ? u.vip_title : u.company
      profile = {
        user_id: row.user_id,
        display_name: display,
        affiliation: aff,
        match_offer: u.match_offer,
        posts: [],
      }
      map.set(row.user_id, profile)
    }
    profile.posts.push({
      body: row.body,
      tags: row.tags,
      section: row.section,
    })
  }
  return Array.from(map.values())
}
