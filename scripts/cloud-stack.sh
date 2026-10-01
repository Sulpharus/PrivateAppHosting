#!/usr/bin/env bash
# Starts the local stack in a Claude Code cloud container: dockerd (not started by default),
# then local Supabase without the services whose images the container cannot pull. The
# container restarts now and then; run this again when `docker ps` fails. Afterwards:
#   pnpm exec supabase db reset --local
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
rm -f /var/run/docker.pid
docker ps >/dev/null 2>&1 || (nohup dockerd >/tmp/dockerd.log 2>&1 &)
timeout 60 bash -c 'until docker ps >/dev/null 2>&1; do sleep 1; done'
for _ in 1 2 3; do
  pnpm exec supabase start -x vector,logflare,studio,imgproxy,edge-runtime,supavisor,postgres-meta \
    >/tmp/sb.log 2>&1 && break
  timeout 120 bash -c 'until [ "$(docker inspect -f "{{.State.Health.Status}}" supabase_db_mininode 2>/dev/null)" = healthy ]; do sleep 2; done'
done
tail -1 /tmp/sb.log
