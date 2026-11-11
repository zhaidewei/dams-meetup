#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

run_dir=$(mktemp -d "${TMPDIR:-/tmp}/dams-meetup15-loadtest.XXXXXX")
mkdir "$run_dir/bundle"
cp loadtest/meetup15/observer.mjs "$run_dir/bundle/m6-observer.mjs"
export WRANGLER_LOG_PATH="$run_dir/wrangler.log"
export WRANGLER_SEND_METRICS=false
export DAMS_M6_CONNECTIONS="${DAMS_M6_CONNECTIONS:-48}"
export DAMS_M6_COMMIT="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  DAMS_M6_COMMIT="$DAMS_M6_COMMIT (dirty working tree)"
fi
echo "Results and logs: $run_dir"

npx --no-install opennextjs-cloudflare build > "$run_dir/build.log" 2>&1
npx --no-install wrangler deploy --dry-run --outdir "$run_dir/bundle" > "$run_dir/bundle.log" 2>&1
node loadtest/meetup15/server.mjs "$run_dir" > "$run_dir/server.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
for ((attempt = 0; attempt < 100; attempt++)); do
  if grep -q 'Direct Miniflare ready:' "$run_dir/server.log"; then
    base=$(sed -n "s|^Direct Miniflare ready: \(http://127.0.0.1:[0-9]*\)/$|\1|p" "$run_dir/server.log")
    node loadtest/meetup15/run.mjs "$run_dir" "$base"
    exit
  fi
  kill -0 "$server_pid" 2>/dev/null || break
  sleep 0.2
done
cat "$run_dir/server.log" >&2
exit 1
