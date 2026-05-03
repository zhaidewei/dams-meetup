'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getServerSupabase } from '@/lib/supabase/server'

export async function toggleLikeAction(postId: number) {
  const user = await getCurrentUser()
  if (!user) redirect('/')

  const sb = getServerSupabase()

  const { data: existing } = await sb
    .from('likes')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('post_id', postId)
    .maybeSingle()

  if (existing) {
    await sb.from('likes').delete().eq('user_id', user.id).eq('post_id', postId)
  } else {
    await sb.from('likes').insert({ user_id: user.id, post_id: postId })
  }

  revalidatePath('/feed')
}

// FormData wrapper so LikeButton can use <form action={...}> (progressive
// enhancement — works even when React event listeners fail to bind on iOS).
export async function toggleLikeFormAction(formData: FormData): Promise<void> {
  const postId = Number(formData.get('post_id'))
  if (!Number.isFinite(postId) || postId <= 0) return
  await toggleLikeAction(postId)
}
