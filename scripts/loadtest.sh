#!/usr/bin/env bash
# Inject runtime credentials from macOS Keychain and start the load test.
# Default: 250 users, 5 min, against http://localhost:3000.
#
# Examples:
#   ./scripts/loadtest.sh
#   ./scripts/loadtest.sh --users 50 --duration 60
#   ./scripts/loadtest.sh --target https://staging.example.com --users 100
#   LOADTEST_PROD_OK=1 ./scripts/loadtest.sh --target https://live.nl-dams.com   # requires opt-in

set -euo pipefail

if ! command -v secret >/dev/null 2>&1; then
  echo "ERROR: 'secret' CLI not found at ~/.local/bin/secret" >&2
  exit 1
fi

export EVENT_PASSWORD="$(secret get dams-event-password)"
export NEXT_PUBLIC_SUPABASE_URL="$(secret get supabase-dams-url)"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(secret get supabase-dams-anon)"
export SUPABASE_SERVICE_ROLE_KEY="$(secret get supabase-dams-srv)"

cd "$(dirname "$0")/.."
exec node loadtest/run.mjs "$@"
