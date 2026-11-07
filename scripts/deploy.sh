#!/usr/bin/env bash
# Workers Builds 在合并 main 后自动发布。仅在该链路不可用时手动运行。
# 发布前按 docs/dev-setup.md 核对生产 D1 迁移和入场开关。
set -euo pipefail

cd "$(dirname "$0")/.."
npx --no-install opennextjs-cloudflare build
exec npx --no-install opennextjs-cloudflare deploy
