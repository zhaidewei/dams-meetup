#!/usr/bin/env bash
# 朋友帮忙跑压测的 wrapper（不依赖 macOS Keychain，跨平台）。
# 读 loadtest/.env.friends 注入凭据，转发参数给 loadtest/run.mjs。
#
# 用法（详见 loadtest/FRIENDS.md）：
#   bash loadtest/friend.sh --users 30 --duration 180

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/loadtest/.env.friends"

if [ ! -f "$ENV_FILE" ]; then
  cat <<EOF >&2
[friend.sh] 缺少 $ENV_FILE

请按 loadtest/FRIENDS.md 的说明，新建这个文件并填上 zdw 私下给的 4 个值：
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  EVENT_PASSWORD=...
EOF
  exit 1
fi

# `set -a` 让 source 进来的变量自动 export
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

REQUIRED=(NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY EVENT_PASSWORD)
for v in "${REQUIRED[@]}"; do
  if [ -z "${!v:-}" ]; then
    echo "[friend.sh] $ENV_FILE 里缺 $v" >&2
    exit 1
  fi
done

# 默认打生产；prod 二次确认开关
export LOADTEST_PROD_OK=1
TARGET="${LOADTEST_TARGET:-https://live.nl-dams.com}"

cd "$REPO_ROOT"
exec node loadtest/run.mjs --target "$TARGET" "$@"
