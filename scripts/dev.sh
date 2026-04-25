#!/usr/bin/env bash
# Inject runtime credentials from macOS Keychain (via `secret` CLI) and start Next.js dev server.
# Per project policy, secrets must never be written to .env files or committed.

set -euo pipefail

if ! command -v secret >/dev/null 2>&1; then
  echo "ERROR: 'secret' CLI not found. Expected at ~/.local/bin/secret" >&2
  exit 1
fi

# --- Secrets (from Keychain) ---
export EVENT_PASSWORD="$(secret get dams-event-password)"
export NEXT_PUBLIC_SUPABASE_URL="$(secret get supabase-dams-url)"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(secret get supabase-dams-anon)"
export SUPABASE_SERVICE_ROLE_KEY="$(secret get supabase-dams-srv)"
export DEEPSEEK_API_KEY="$(secret get deepseek-dams-key)"

# --- Non-secret config ---
export NEXT_PUBLIC_EVENT_NAME="荷兰华人数据群 Meetup 第14期"
export NEXT_PUBLIC_EVENT_START="2026-05-09T12:45:00+02:00"
export NEXT_PUBLIC_EVENT_END="2026-05-09T18:00:00+02:00"
export NEXT_PUBLIC_EVENT_ORGANIZER="DAMS"

exec npx next dev "$@"
