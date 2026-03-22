#!/usr/bin/env bash
set -euo pipefail

# Restore the Paperclip database from a paperclip-*.sql backup file.
# DESTRUCTIVE: overwrites the database targeted by DATABASE_URL / config.
#
# Usage:
#   ./scripts/restore-db.sh -f ~/.paperclip/instances/default/data/backups/paperclip-20260101-120000.sql --i-know-this-overwrites-data
#   pnpm db:restore -- -f path/to/paperclip-....sql --i-know-this-overwrites-data
#
# Stop the API server before restoring. After restore, run `pnpm db:migrate` if the app is newer than the backup.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"
exec pnpm paperclipai db:restore "$@"
