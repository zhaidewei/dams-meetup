#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
dams_state_dir="${DAMS_DEV_STATE_DIR:-.wrangler/state}"
mkdir -p .wrangler
export WRANGLER_REGISTRY_PATH="${WRANGLER_REGISTRY_PATH:-$PWD/.wrangler/registry}"
export WRANGLER_LOG_PATH="${WRANGLER_LOG_PATH:-$PWD/.wrangler/dev.log}"

CI=1 npx --no-install wrangler d1 migrations apply ACTIVITY_DB --local --persist-to "$dams_state_dir"
npx --no-install opennextjs-cloudflare build

# 公开的测试值，只用于本机回环地址和本地数据库。
set --
if [[ -n "${DAMS_LOCAL_MEETUP_TIME:-}" ]]; then
  set -- --var "DAMS_LOCAL_MEETUP_TIME:$DAMS_LOCAL_MEETUP_TIME"
fi
exec npx --no-install wrangler dev --local --ip 127.0.0.1 \
  --port "${DAMS_DEV_PORT:-3000}" --persist-to "$dams_state_dir" \
  --var ADMIN_TOKEN:dams-local-admin \
  --var SESSION_SECRET:dams-local-fixture-signing-key-never-production "$@"
