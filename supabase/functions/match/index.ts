// AI 撮合 Edge Function — 拉候选 → 调 DeepSeek → 写 replies → 记 match_runs 日志。
//
// 触发：
//   - cron（默认）：未处理的 match_intent 帖子 < MIN_INTENT_THRESHOLD 直接 skip
//   - admin：URL ?force=<ADMIN_TOKEN> 跳过阈值
//
// env：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEEPSEEK_API_KEY / ADMIN_TOKEN

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { aggregateProfiles, buildPrompt, type CandidatePost, type RawPostWithUser } from './prompt.ts'
import { callDeepSeek } from './deepseek.ts'

const MIN_INTENT_THRESHOLD = 3
const CANDIDATE_LIMIT = 50
const PROFILES_POST_LIMIT = 500
const REASON_MAX_CHARS = 500

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const forceToken = url.searchParams.get('force')
  const adminToken = Deno.env.get('ADMIN_TOKEN')
  const isAdmin = !!(adminToken && forceToken && forceToken === adminToken)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
  if (!supabaseUrl || !serviceKey || !apiKey) {
    return jsonResponse({ error: 'env not configured' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const trigger = isAdmin ? 'admin' : 'cron'

  const { data: run, error: runErr } = await supabase
    .from('match_runs')
    .insert({ status: 'running', trigger })
    .select('id')
    .single()
  if (runErr || !run) {
    return jsonResponse({ error: `run insert failed: ${runErr?.message}` }, 500)
  }
  const runId = run.id as number

  try {
    const candidates = await fetchCandidates(supabase)

    if (!isAdmin && candidates.length < MIN_INTENT_THRESHOLD) {
      await finishRun(supabase, runId, {
        status: 'skipped_low_intent',
        posts_processed: candidates.length,
      })
      return jsonResponse({ status: 'skipped_low_intent', candidates: candidates.length })
    }

    if (candidates.length === 0) {
      await finishRun(supabase, runId, { status: 'success', posts_processed: 0 })
      return jsonResponse({ status: 'success', candidates: 0 })
    }

    const profiles = await fetchProfiles(supabase)

    const userPrompt = buildPrompt({ candidates, profiles })
    const recs = await callDeepSeek(userPrompt, apiKey)

    const candidateIds = new Set(candidates.map((c) => c.id))
    const candidateAuthors = new Map(candidates.map((c) => [c.id, c.user_id]))

    let inserted = 0
    for (const rec of recs) {
      if (!candidateIds.has(rec.post_id)) continue
      if (candidateAuthors.get(rec.post_id) === rec.user_id) continue

      const { error } = await supabase.from('replies').insert({
        post_id: rec.post_id,
        user_id: null,
        is_ai: true,
        visibility: 'author_only',
        body: rec.reason.slice(0, REASON_MAX_CHARS),
        mentioned_user_id: rec.user_id,
      })
      if (!error) {
        inserted++
      } else if (error.code !== '23505') {
        // 23505 = unique violation = dedup index 命中，静默跳过
        console.error(`insert failed post=${rec.post_id} user=${rec.user_id}: ${error.message}`)
      }
    }

    await finishRun(supabase, runId, {
      status: 'success',
      posts_processed: candidates.length,
      replies_inserted: inserted,
    })

    return jsonResponse({
      status: 'success',
      candidates: candidates.length,
      recommendations: recs.length,
      inserted,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await finishRun(supabase, runId, { status: 'failed', error: msg.slice(0, 1000) })
    return jsonResponse({ status: 'failed', error: msg }, 500)
  }
})

async function fetchCandidates(supabase: SupabaseClient): Promise<CandidatePost[]> {
  // match_intent 自 migration 0011 起搬到 post_match_intents（防 Realtime 泄漏）。
  // 这里反向 join：以 intent 表为驱动，inner join posts 取业务字段。
  type IntentRow = {
    intent: string
    post: {
      id: number
      body: string
      tags: string[]
      section: string | null
      user_id: string
      created_at: string
    } | null
  }

  const { data: rows, error } = await supabase
    .from('post_match_intents')
    .select(
      'intent, post:posts!inner ( id, body, tags, section, user_id, created_at )',
    )
    .order('created_at', { ascending: false })
    .limit(CANDIDATE_LIMIT)
  if (error) throw new Error(`candidate query: ${error.message}`)

  // 排除已经有 AI reply 的帖子（避免重复处理）
  const { data: processed, error: procErr } = await supabase
    .from('replies')
    .select('post_id')
    .eq('is_ai', true)
  if (procErr) throw new Error(`processed query: ${procErr.message}`)
  const skip = new Set((processed ?? []).map((r) => r.post_id))

  return ((rows ?? []) as IntentRow[])
    .filter((r): r is IntentRow & { post: NonNullable<IntentRow['post']> } =>
      r.post !== null && !skip.has(r.post.id),
    )
    .map((r) => ({
      id: r.post.id,
      body: r.post.body,
      tags: r.post.tags,
      section: r.post.section,
      user_id: r.post.user_id,
      match_intent: r.intent,
    }))
}

async function fetchProfiles(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('posts')
    .select('user_id, body, tags, section, users:user_id (id, nickname, company, is_vip, vip_name, vip_title)')
    .order('created_at', { ascending: false })
    .limit(PROFILES_POST_LIMIT)
  if (error) throw new Error(`profiles query: ${error.message}`)
  return aggregateProfiles((data ?? []) as unknown as RawPostWithUser[])
}

async function finishRun(
  supabase: SupabaseClient,
  runId: number,
  fields: Record<string, unknown>,
) {
  await supabase
    .from('match_runs')
    .update({ ...fields, finished_at: new Date().toISOString() })
    .eq('id', runId)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
