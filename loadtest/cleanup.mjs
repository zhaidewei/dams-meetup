// Remove rows created by this run. Identified by users.contact_handle prefix.
// Cascades to posts/likes/replies/poll_votes/post_match_intents via FKs in
// migration 0001 (ON DELETE CASCADE).

import { createClient } from '@supabase/supabase-js'

export async function cleanup({ url, srv, prefix }) {
  const sb = createClient(url, srv, { auth: { persistSession: false } })
  const { data, error } = await sb
    .from('users')
    .select('id')
    .like('contact_handle', `${prefix}%`)
  if (error) { console.error('cleanup query failed:', error.message); return 0 }
  if (!data?.length) return 0
  const ids = data.map(r => r.id)
  // Delete in batches of 100 to keep payload reasonable
  let removed = 0
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { error: delErr } = await sb.from('users').delete().in('id', batch)
    if (delErr) { console.error('cleanup delete failed:', delErr.message); break }
    removed += batch.length
  }
  return removed
}
