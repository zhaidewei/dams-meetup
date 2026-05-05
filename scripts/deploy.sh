#!/usr/bin/env bash
# Local manual deploy to Cloudflare Workers. Use only as a fallback when the
# CF dashboard auto-deploy (Workers Builds → main) is unavailable.
#
# Normal flow: merge to main → CF Workers Builds runs build & deploy with
# NEXT_PUBLIC_* injected from dashboard env vars. No human action needed.
#
# This script exists because `next build` inlines NEXT_PUBLIC_* into the
# bundle at build time. A bare `opennextjs-cloudflare build && deploy` from
# a shell without those vars ships a bundle where every NEXT_PUBLIC_* is
# undefined — server actions that touch Supabase then 500 in production.
#
# Runtime secrets (EVENT_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, DEEPSEEK_API_KEY)
# are managed in the Worker via `wrangler secret put` (see scripts/cf-secrets-push.sh)
# and do not need to be exported here.

set -euo pipefail

if ! command -v secret >/dev/null 2>&1; then
  echo "ERROR: 'secret' CLI not found. Expected at ~/.local/bin/secret" >&2
  exit 1
fi

echo "→ Injecting NEXT_PUBLIC_* from Keychain"
export NEXT_PUBLIC_SUPABASE_URL="$(secret get supabase-dams-url)"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(secret get supabase-dams-anon)"
export NEXT_PUBLIC_EVENT_NAME="荷兰华人数据群 Meetup 第14期"
export NEXT_PUBLIC_EVENT_START="2026-05-09T12:45:00+02:00"
export NEXT_PUBLIC_EVENT_END="2026-05-09T18:00:00+02:00"
export NEXT_PUBLIC_EVENT_ORGANIZER="DAMS"

echo "→ Building Worker bundle"
npx opennextjs-cloudflare build

echo "→ Deploying to live.nl-dams.com"
exec npx opennextjs-cloudflare deploy
