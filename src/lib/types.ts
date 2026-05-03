// Hand-written types matching supabase/migrations/0001_schema.sql.
// TODO: replace with `supabase gen types typescript` output once project is linked.

export type UserRow = {
  id: string
  nickname: string | null
  company: string | null
  contact_handle: string | null
  show_contact: boolean
  recovery_token: string
  is_vip: boolean
  vip_name: string | null
  vip_title: string | null
  created_at: string
  last_seen_at: string
}

export type PollOption = { id: number; label: string }

export type PostRow = {
  id: number
  user_id: string
  type: 'text' | 'poll'
  body: string
  tags: string[]
  show_contact: boolean
  section: 'p1' | 'p2' | 'breakout' | 'panel' | null
  poll_options: PollOption[] | null
  poll_multi: boolean | null
  poll_deadline: string | null
  poll_hide_results: boolean | null
  match_intent: string | null
  created_at: string
}

export type ReplyVisibility = 'public' | 'author_only'

export type ReplyRow = {
  id: number
  post_id: number
  user_id: string | null
  parent_reply_id: number | null
  body: string
  created_at: string
  updated_at: string | null
  is_ai: boolean
  visibility: ReplyVisibility
  mentioned_user_id: string | null
}

export type LikeRow = {
  user_id: string
  post_id: number
  created_at: string
}

export type PollVoteRow = {
  user_id: string
  post_id: number
  option_id: number
  created_at: string
}

export type VipTokenRow = {
  token: string
  vip_name: string
  vip_title: string | null
  user_id: string | null
  created_at: string
  used_at: string | null
}

export type PublicUserDisplay = Pick<
  UserRow,
  'id' | 'nickname' | 'company' | 'contact_handle' | 'show_contact' | 'is_vip' | 'vip_name' | 'vip_title'
>
