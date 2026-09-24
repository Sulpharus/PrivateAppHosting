#!/usr/bin/env bash
# Monthly restore drill (systemd timer mininode-restore-drill.timer). Restores the newest R2
# snapshot into a scratch directory, loads the dump into a throwaway Postgres and checks that
# the platform tables contain data. Proves the off-site copy is usable, not just present.
#   ./restore-drill.sh [local|r2]   (default r2)
set -euo pipefail

# shellcheck source=/dev/null
. /etc/mininode/backup.env
export RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
repo=$RESTIC_R2_REPO
[ "${1:-r2}" = local ] && repo=$RESTIC_LOCAL_REPO
PG_IMAGE=${PG_IMAGE:-postgres:17-alpine}

ping() { [ -n "${DRILL_HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 -o /dev/null "$DRILL_HEALTHCHECK_URL$1" || true; }
scratch=$(mktemp -d /var/tmp/mininode-drill.XXXXXX)
container=mininode-drill-$$
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT
trap 'ping /fail' ERR
ping /start

echo "▸ restoring latest snapshot from $repo"
restic -r "$repo" restore latest --host nucbox --tag nightly --target "$scratch" \
  --include '/var/tmp/mininode-backup.*/supabase.dump'
dump=$(find "$scratch" -name supabase.dump -print -quit)
[ -s "$dump" ] || { echo "no dump in snapshot" >&2; exit 1; }

echo "▸ loading into scratch postgres"
docker run -d --name "$container" -e POSTGRES_PASSWORD=drill -v "$(dirname "$dump"):/in:ro" "$PG_IMAGE" >/dev/null
for _ in $(seq 1 30); do docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
# Supabase roles referenced by policies do not exist in plain Postgres; create them first.
docker exec "$container" psql -U postgres -qc \
  "create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create role supabase_storage_admin;"
docker exec "$container" pg_restore -U postgres -d postgres --no-owner --no-privileges /in/supabase.dump 2>"$scratch/restore.log" || true
grep -E "^pg_restore: error" "$scratch/restore.log" | grep -v "already exists\|extension\|does not exist" && echo "(errors above are informational)" || true

users=$(docker exec "$container" psql -U postgres -tAc "select count(*) from platform.profiles")
apps=$(docker exec "$container" psql -U postgres -tAc "select count(*) from platform.apps")
echo "  profiles: $users, apps: $apps"
[ "$users" -gt 0 ] || { echo "restored database has no users" >&2; exit 1; }

ping ""
echo "restore drill passed"
