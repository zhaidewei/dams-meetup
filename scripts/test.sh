#!/usr/bin/env bash
# Inject Supabase secrets from macOS Keychain (if available) and run vitest.
# Smoke tests (tests/supabase-smoke.test.ts) self-skip if env vars are missing,
# so this script is a noop in CI / on machines without the `secret` CLI.

set -uo pipefail

if command -v secret >/dev/null 2>&1; then
  if val="$(secret get supabase-dams-url 2>/dev/null)"; then
    export NEXT_PUBLIC_SUPABASE_URL="$val"
  fi
  if val="$(secret get supabase-dams-srv 2>/dev/null)"; then
    export SUPABASE_SERVICE_ROLE_KEY="$val"
  fi
fi

exec npx vitest run "$@"
