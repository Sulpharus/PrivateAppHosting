#!/usr/bin/env bash
# Writes the Data API schemas the project exposes now into supabase/config.toml before
# `supabase config push`. config.toml lists only the platform's own schemas; the app schemas
# (app_<slug>) are added by each app's deploy and removed by its uninstall. Without this step every
# config push would hide them again, and apps with tables would fail to load until their next
# deploy (2026-10-20: Sportplaner, Haushalt, Medialog and Wunschliste).
# Stops when the setting cannot be read: pushing a shorter list is exactly what must not happen.
# Needs SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN; uses curl and jq.
set -euo pipefail
config="${1:-supabase/config.toml}"
remote=$(curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/postgrest" | jq -er '.db_schema | strings')
# The local list first, then every app schema the project has now, each once, in order.
local_list=$(sed -n 's/^schemas = \(\[.*\]\)$/\1/p' "$config")
if [ -z "$local_list" ]; then
  echo "::error::no 'schemas = [...]' line in $config"
  exit 1
fi
wanted=$(jq -nc --argjson base "$local_list" --arg remote "$remote" '
  $base + ($remote | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(test("^app_[a-z0-9_]+$"))))
  | reduce .[] as $s ([]; if index([$s]) then . else . + [$s] end)')
sed -i "s/^schemas = \[.*\]$/schemas = ${wanted//\//\\/}/" "$config"
echo "Data API schemas for config push: $wanted"
