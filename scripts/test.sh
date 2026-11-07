#!/usr/bin/env bash
set -euo pipefail

if [[ "${DAMS_TEST_LEGACY_SUPABASE:-0}" == 1 ]]; then
  if command -v secret >/dev/null 2>&1; then
    export NEXT_PUBLIC_SUPABASE_URL="$(secret get supabase-dams-url)"
    export SUPABASE_SERVICE_ROLE_KEY="$(secret get supabase-dams-srv)"
  fi
else
  unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
fi

exec npx --no-install vitest run "$@"
