#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

run_dir=$(mktemp -d "${TMPDIR:-/tmp}/dams-meetup15-loadtest.XXXXXX")
mkdir "$run_dir/bundle"
cp loadtest/meetup15/observer.mjs "$run_dir/bundle/m6-observer.mjs"
export WRANGLER_LOG_PATH="$run_dir/wrangler.log"
export WRANGLER_SEND_METRICS=false
export DAMS_M6_COMMIT="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain)" ]]; then
  DAMS_M6_COMMIT="$DAMS_M6_COMMIT (dirty working tree)"
fi
echo "Results and logs: $run_dir"

npx --no-install opennextjs-cloudflare build > "$run_dir/build.log" 2>&1
npx --no-install wrangler deploy --dry-run --outdir "$run_dir/bundle" > "$run_dir/bundle.log" 2>&1

run_case() (
  export DAMS_M6_CONNECTIONS="$1"
  export DAMS_WS_BATCH="$2"
  local output="$3" server_pid base
  mkdir -p "$output"
  echo "HTTP $DAMS_M6_CONNECTIONS / WebSocket $DAMS_WS_BATCH: $output"
  node loadtest/meetup15/server.mjs "$run_dir" > "$output/server.log" 2>&1 &
  server_pid=$!
  trap 'kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true' EXIT
  for ((attempt = 0; attempt < 100; attempt++)); do
    base=$(sed -n "s|^Direct Miniflare ready: \(http://127.0.0.1:[0-9]*\)/$|\1|p" "$output/server.log")
    if [[ -n "$base" ]]; then
      node loadtest/meetup15/run.mjs "$output" "$base"
      exit
    fi
    kill -0 "$server_pid" 2>/dev/null || break
    sleep 0.2
  done
  cat "$output/server.log" >&2
  exit 1
)

if [[ "${DAMS_M6_MATRIX:-0}" == 1 ]]; then
  failed=0
  for connections in 48 200; do
    for batch in 25 200; do
      run_case "$connections" "$batch" "$run_dir/$connections-$batch" || failed=1
    done
  done
  exit "$failed"
fi

run_case "${DAMS_M6_CONNECTIONS:-48}" "${DAMS_WS_BATCH:-25}" "$run_dir"
