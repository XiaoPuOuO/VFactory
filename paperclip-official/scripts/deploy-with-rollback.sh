#!/usr/bin/env bash
# 單機多版本 artifact 部署：解壓新版本 → 健康檢查 → 切換 symlink；失敗則還原上一版並可選 POST 稽核。
#
# 環境變數：
#   PAPERCLIP_DEPLOY_BASE      部署根目錄（必填），例如 /var/paperclip/releases
#   PAPERCLIP_DEPLOY_NAME      版本目錄名稱（必填），例如 20260401-abc123
#   PAPERCLIP_DEPLOY_ARCHIVE   要解壓的 tarball 路徑（必填）
#   PAPERCLIP_CURRENT_SYMLINK  指向「目前」版本的 symlink 名稱，預設 current
#   PAPERCLIP_HEALTH_URL       切換後要 GET 的健康檢查 URL（選填）；未設則跳過 HTTP 檢查
#   PAPERCLIP_ACTIVITY_URL     若設定，rollback 時 POST JSON 記錄稽核（選填）
#   DRY_RUN                    設為 1 時只列印將執行的步驟
#
set -euo pipefail

DEPLOY_BASE="${PAPERCLIP_DEPLOY_BASE:-}"
DEPLOY_NAME="${PAPERCLIP_DEPLOY_NAME:-}"
ARCHIVE="${PAPERCLIP_DEPLOY_ARCHIVE:-}"
CURRENT_NAME="${PAPERCLIP_CURRENT_SYMLINK:-current}"
HEALTH_URL="${PAPERCLIP_HEALTH_URL:-}"
ACTIVITY_URL="${PAPERCLIP_ACTIVITY_URL:-}"
DRY_RUN="${DRY_RUN:-0}"

usage() {
  cat <<'EOF'
Usage: PAPERCLIP_DEPLOY_BASE=... PAPERCLIP_DEPLOY_NAME=... PAPERCLIP_DEPLOY_ARCHIVE=... ./scripts/deploy-with-rollback.sh

See script header for optional env vars.
EOF
}

if [[ -z "$DEPLOY_BASE" || -z "$DEPLOY_NAME" || -z "$ARCHIVE" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Error: archive not found: $ARCHIVE" >&2
  exit 1
fi

TARGET_DIR="$DEPLOY_BASE/$DEPLOY_NAME"
CURRENT_LINK="$DEPLOY_BASE/$CURRENT_NAME"
PREVIOUS_TARGET=""

if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK" || true)"
fi

log_step() {
  echo "==> $*"
}

run_cmd() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

post_activity_rollback() {
  local reason=$1
  if [[ -z "$ACTIVITY_URL" ]]; then
    return 0
  fi
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] POST $ACTIVITY_URL (deployment.rollback)"
    return 0
  fi
  payload="$(python3 -c "import json,sys
p=sys.argv[1:4]+['','','']
print(json.dumps({'action':'deployment.rollback','details':{'reason':p[0],'previousTarget':p[1] or None,'attemptedTarget':p[2]}}))" "$reason" "${PREVIOUS_TARGET:-}" "$TARGET_DIR")"
  curl -fsS -X POST "$ACTIVITY_URL" -H 'Content-Type: application/json' -d "$payload" || echo "Warning: activity POST failed" >&2
}

rollback() {
  local reason=$1
  log_step "Rollback: $reason"
  if [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
    run_cmd ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
  else
    echo "Error: no previous release to roll back to." >&2
  fi
  post_activity_rollback "$reason"
  exit 1
}

log_step "Extract $ARCHIVE -> $TARGET_DIR"
run_cmd mkdir -p "$DEPLOY_BASE"
run_cmd rm -rf "$TARGET_DIR"
run_cmd mkdir -p "$TARGET_DIR"
run_cmd tar -xzf "$ARCHIVE" -C "$TARGET_DIR" --strip-components=1

log_step "Point $CURRENT_LINK -> $TARGET_DIR (previous: ${PREVIOUS_TARGET:-<none>})"
run_cmd ln -sfn "$TARGET_DIR" "$CURRENT_LINK"

if [[ -n "$HEALTH_URL" ]]; then
  log_step "Health check GET $HEALTH_URL"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[dry-run] curl health"
  elif ! curl -fsS --max-time 30 "$HEALTH_URL" >/dev/null; then
    rollback "health check failed after symlink switch"
  fi
fi

log_step "Deploy OK: $CURRENT_LINK -> $TARGET_DIR"
