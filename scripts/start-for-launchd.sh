#!/usr/bin/env bash
# 供 launchd 呼叫：載入 .env 後執行 pnpm dev（請以 login shell 或設定 PATH 後執行）
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
# 確保 node/pnpm/agent 在 PATH（launchd 預設 PATH 可能不含 Homebrew 或 .local/bin）
export PATH="/Users/xiaopu/.local/bin:/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin}"
set -a
[ -f .env ] && source .env
set +a
exec pnpm dev
