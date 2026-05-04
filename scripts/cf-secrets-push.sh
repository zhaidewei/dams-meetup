#!/usr/bin/env bash
# Push runtime secrets from macOS Keychain to Cloudflare Worker.
# Per project policy, secrets are only stored in Keychain via the `secret` CLI.
#
# Pre-req:
#   - `wrangler login` done (or CLOUDFLARE_API_TOKEN exported)
#   - Worker `dams-meetup` exists in your CF account (created by first deploy or CF dashboard)
#
# Build-time env vars (NEXT_PUBLIC_*, NEXT_PUBLIC_EVENT_*) are NOT pushed by this script —
# they must be set in CF dashboard → Workers & Pages → dams-meetup → Settings →
# "Build environment variables", because they get baked into the client bundle at build time.

set -euo pipefail

if ! command -v secret >/dev/null 2>&1; then
  echo "ERROR: 'secret' CLI not found. Expected at ~/.local/bin/secret" >&2
  exit 1
fi

if ! command -v wrangler >/dev/null 2>&1 && [ ! -x "$(npm bin)/wrangler" ]; then
  WRANGLER="npx wrangler"
else
  WRANGLER="wrangler"
fi

push() {
  local name="$1"
  local keychain_key="$2"
  echo ">> Pushing $name (from Keychain key: $keychain_key)"
  secret get "$keychain_key" | $WRANGLER secret put "$name"
}

push EVENT_PASSWORD            dams-event-password
push SUPABASE_SERVICE_ROLE_KEY supabase-dams-srv
push DEEPSEEK_API_KEY          deepseek-dams-key
push ADMIN_TOKEN               dams-admin-token

echo ""
echo "Done. Verify with: $WRANGLER secret list"
echo ""
echo "REMINDER — set these as Build env vars in CF dashboard (NOT runtime secrets):"
echo "  NEXT_PUBLIC_SUPABASE_URL          (from: secret get supabase-dams-url)"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY     (from: secret get supabase-dams-anon)"
echo "  NEXT_PUBLIC_EVENT_NAME=荷兰华人数据群 Meetup 第14期"
echo "  NEXT_PUBLIC_EVENT_START=2026-05-09T12:45:00+02:00"
echo "  NEXT_PUBLIC_EVENT_END=2026-05-09T18:00:00+02:00"
echo "  NEXT_PUBLIC_EVENT_ORGANIZER=DAMS"
