#!/usr/bin/env bash
# Inject Supabase credentials and run the loadtest seed script.
#
# Examples:
#   ./scripts/seed.sh                   # default volumes
#   ./scripts/seed.sh --posts 600 --likes 2500
#   ./scripts/seed.sh --cleanup         # remove all SEED-* rows

set -euo pipefail

if ! command -v secret >/dev/null 2>&1; then
  echo "ERROR: 'secret' CLI not found at ~/.local/bin/secret" >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$(secret get supabase-dams-url)"
export SUPABASE_SERVICE_ROLE_KEY="$(secret get supabase-dams-srv)"
export NEXT_PUBLIC_EVENT_START="2026-05-09T12:45:00+02:00"
export NEXT_PUBLIC_EVENT_END="2026-05-09T18:00:00+02:00"

cd "$(dirname "$0")/.."
exec node loadtest/seed.mjs "$@"
