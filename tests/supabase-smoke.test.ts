import { describe, it, expect } from 'vitest'

// Smoke test: verify SUPABASE_URL + SERVICE_ROLE_KEY actually reach a live DB.
// Skipped automatically when env vars are missing (CI without secrets).
//
// To run locally with env loaded: `npm test` (uses scripts/test.sh which injects
// secrets from macOS Keychain). Plain `vitest run` will skip this test.

const haveEnv =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

describe('Supabase connectivity', () => {
  it.skipIf(!haveEnv)('service-role key can reach users table', async () => {
    const { getServerSupabase } = await import('../src/lib/supabase/server')
    const sb = getServerSupabase()

    const { error, count } = await sb
      .from('users')
      .select('id', { count: 'exact', head: true })

    expect(error).toBeNull()
    expect(typeof count).toBe('number')
  }, 10_000)

  it.skipIf(!haveEnv)('vip_tokens is reachable (RLS allows service role)', async () => {
    const { getServerSupabase } = await import('../src/lib/supabase/server')
    const sb = getServerSupabase()

    const { error } = await sb
      .from('vip_tokens')
      .select('token', { count: 'exact', head: true })

    expect(error).toBeNull()
  }, 10_000)
})
