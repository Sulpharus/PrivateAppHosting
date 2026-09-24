#!/usr/bin/env bash
# Creates or updates one proxied CNAME: dns-upsert.sh <hostname> <target>
# Used by the deploy workflow for container apps (<slug>.mininode.app → tunnel).
set -euo pipefail
name=$1 target=$2
zone_name=${ZONE_NAME:-mininode.app}
api=https://api.cloudflare.com/client/v4
auth=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN:?}" -H 'Content-Type: application/json')

zone=$(curl -fsS "${auth[@]}" "$api/zones?name=$zone_name" | jq -r '.result[0].id')
existing=$(curl -fsS "${auth[@]}" "$api/zones/$zone/dns_records?name=$name" | jq -r '.result[0] // empty')
record=$(jq -nc --arg n "$name" --arg c "$target" '{type:"CNAME",name:$n,content:$c,proxied:true,comment:"mininode app"}')

if [ -z "$existing" ]; then
  curl -fsS "${auth[@]}" -X POST "$api/zones/$zone/dns_records" --data "$record" >/dev/null
  echo "created $name → $target"
elif [ "$(jq -r '.type' <<<"$existing")" != CNAME ]; then
  echo "$name exists as $(jq -r '.type' <<<"$existing") (a Worker custom domain?) — refusing to overwrite" >&2
  exit 1
elif [ "$(jq -r '.content' <<<"$existing")" != "$target" ]; then
  curl -fsS "${auth[@]}" -X PUT "$api/zones/$zone/dns_records/$(jq -r '.id' <<<"$existing")" --data "$record" >/dev/null
  echo "updated $name → $target"
else
  echo "$name already → $target"
fi
