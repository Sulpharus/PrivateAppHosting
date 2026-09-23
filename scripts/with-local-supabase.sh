#!/usr/bin/env bash
# Runs a command with SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY pointing at
# the local Supabase stack (start it with `pnpm db:start`).
set -euo pipefail
env_lines="$(pnpm exec supabase status -o env 2>/dev/null)" || {
  echo "Local Supabase is not running. Start it with: pnpm db:start" >&2
  exit 1
}
eval "$(grep -E '^(API_URL|PUBLISHABLE_KEY|SECRET_KEY)=' <<<"$env_lines")"
export SUPABASE_URL="$API_URL" SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" SUPABASE_SECRET_KEY="$SECRET_KEY"
exec "$@"
