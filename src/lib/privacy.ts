import 'server-only'

// service-role joins 绕过 RLS，返回 Client Component 前仍须执行字段可见性规则。
export function redactPrivateContact<T extends {
  show_contact: boolean
  contact_handle: string | null
}>(user: T): T {
  return { ...user, contact_handle: user.show_contact ? user.contact_handle : null }
}
