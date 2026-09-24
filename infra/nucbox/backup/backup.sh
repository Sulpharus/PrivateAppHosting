#!/usr/bin/env bash
# Nightly backup (systemd timer mininode-backup.timer, 03:30).
# What:  Supabase database (pg_dump, custom format) + NucBox app data, platform config and
#        Wine prefixes. The Windows VM is backed up by Proxmox itself (vzdump job, see runbook).
# Where: two restic repositories: local NVMe and R2 (both encrypted with RESTIC_PASSWORD).
# Keep:  7 daily, 4 weekly, 6 monthly. Healthchecks.io is pinged on start/success/failure.
set -euo pipefail

# shellcheck source=/dev/null
. /etc/mininode/backup.env
: "${SUPABASE_DB_URL:?}" "${RESTIC_PASSWORD:?}" "${RESTIC_LOCAL_REPO:?}" "${RESTIC_R2_REPO:?}"
: "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"
export RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
PG_IMAGE=${PG_IMAGE:-postgres:17-alpine}
ROOT=${MININODE_ROOT:-/srv/mininode}

ping() { [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL$1" || true; }
trap 'ping /fail' ERR
ping /start

staging=$(mktemp -d /var/tmp/mininode-backup.XXXXXX)
trap 'rm -rf "$staging"' EXIT

echo "▸ database dump"
docker run --rm --network host -e PGCONNECT_TIMEOUT=20 -v "$staging:/out" "$PG_IMAGE" \
  pg_dump --format=custom --no-owner --no-privileges \
  --schema=platform --schema='app_*' --schema=auth --schema=storage \
  --file=/out/supabase.dump "$SUPABASE_DB_URL"

echo "▸ wine prefixes"
mkdir -p "$staging/wine"
for volume in $(docker volume ls -q --filter name=mn-wine-); do
  docker run --rm -v "$volume:/v:ro" -v "$staging/wine:/out" alpine:3 \
    tar -C /v -czf "/out/$volume.tar.gz" .
done

paths=("$staging" "$ROOT/apps" "$ROOT/platform")

for repo in "$RESTIC_LOCAL_REPO" "$RESTIC_R2_REPO"; do
  echo "▸ restic → $repo"
  restic -r "$repo" snapshots >/dev/null 2>&1 || restic -r "$repo" init
  restic -r "$repo" backup --host nucbox --tag nightly \
    --exclude "$ROOT/platform/secrets.env" "${paths[@]}"
  restic -r "$repo" forget --host nucbox --tag nightly --prune \
    --keep-daily 7 --keep-weekly 4 --keep-monthly 6
done

# Weekly integrity check on a sample of the data (Sundays).
if [ "$(date +%u)" = 7 ]; then
  restic -r "$RESTIC_LOCAL_REPO" check --read-data-subset=5%
  restic -r "$RESTIC_R2_REPO" check
fi

ping ""
echo "backup done"
