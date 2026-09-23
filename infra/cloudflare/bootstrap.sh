#!/usr/bin/env bash
# One-time, idempotent Cloudflare setup for mininode.app. Safe to re-run: existing resources are
# detected by name and left alone.
#
# Creates: zone hardening, AI Gateway `mininode`, R2 buckets, the NucBox tunnel with its ingress,
# DNS records for the tunnel hostnames, Access apps + service tokens for ssh/control.
# Proxmox is never exposed; reach it over the LAN or via `cloudflared access ssh` + port forward.
# Worker hostnames (mininode.app, api., ai., <slug>.) are NOT created here: `wrangler deploy`
# attaches them as custom domains.
#
# Requires: bash, curl, jq. Run it on the NucBox Linux VM (it writes the tunnel token there).
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./infra/cloudflare/bootstrap.sh
# Token permissions: see docs/runbooks/first-setup.md ("Cloudflare API token").
#
# Secrets that Cloudflare shows only once (service-token secrets, tunnel token) are written to
# $OUT_DIR (default ./cloudflare-secrets, mode 700), never printed.

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
DOMAIN="${DOMAIN:-mininode.app}"
TUNNEL_NAME="${TUNNEL_NAME:-mininode-nucbox}"
OWNER_EMAIL="${OWNER_EMAIL:?set OWNER_EMAIL (the admin who may open Access-protected hosts)}"
OUT_DIR="${OUT_DIR:-./cloudflare-secrets}"
API="https://api.cloudflare.com/client/v4"
ACC="$API/accounts/$CLOUDFLARE_ACCOUNT_ID"

umask 077
mkdir -p "$OUT_DIR"

log() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }

# cf METHOD URL [JSON] → prints .result; fails loudly with Cloudflare's error messages.
cf() {
  local method=$1 url=$2 body=${3:-}
  local response
  response=$(curl -sS -X "$method" "$url" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H 'Content-Type: application/json' \
    ${body:+--data "$body"})
  if [ "$(jq -r '.success' <<<"$response")" != "true" ]; then
    echo "Cloudflare API error on $method $url:" >&2
    jq -r '.errors[]? | "  \(.code): \(.message)"' <<<"$response" >&2
    return 1
  fi
  jq -c '.result' <<<"$response"
}

# ---------------------------------------------------------------------------------------------
log "Zone $DOMAIN"
ZONE_ID=$(cf GET "$API/zones?name=$DOMAIN" | jq -r '.[0].id // empty')
[ -n "$ZONE_ID" ] || { echo "zone $DOMAIN not found in this account" >&2; exit 1; }
ZONE="$API/zones/$ZONE_ID"

cf PATCH "$ZONE/settings/ssl" '{"value":"strict"}' >/dev/null
cf PATCH "$ZONE/settings/always_use_https" '{"value":"on"}' >/dev/null
cf PATCH "$ZONE/settings/min_tls_version" '{"value":"1.2"}' >/dev/null
cf PATCH "$ZONE/settings/automatic_https_rewrites" '{"value":"on"}' >/dev/null
# Only Cloudflare may issue certificates for the domain.
if ! cf GET "$ZONE/dns_records?type=CAA&name=$DOMAIN" | jq -e 'length > 0' >/dev/null; then
  for ca in letsencrypt.org pki.goog digicert.com ssl.com; do
    cf POST "$ZONE/dns_records" \
      "$(jq -nc --arg n "$DOMAIN" --arg v "$ca" '{type:"CAA",name:$n,data:{flags:0,tag:"issue",value:$v}}')" >/dev/null
  done
fi

# ---------------------------------------------------------------------------------------------
log "AI Gateway mininode"
if cf GET "$ACC/ai-gateway/gateways/mininode" >/dev/null 2>&1; then
  echo "  exists"
else
  # Authenticated gateway: only requests carrying cf-aig-authorization (AI_GATEWAY_TOKEN) pass.
  # Field names follow the gateway create API; if Cloudflare rejects them, fall back to the
  # defaults (authentication and logs are on by default) and adjust rate limits in the dashboard.
  cf POST "$ACC/ai-gateway/gateways" '{
    "id": "mininode", "collect_logs": true, "authentication": true,
    "cache_ttl": 0, "cache_invalidate_on_update": true,
    "rate_limiting_interval": 60, "rate_limiting_limit": 120, "rate_limiting_technique": "sliding"
  }' >/dev/null ||
    cf POST "$ACC/ai-gateway/gateways" '{"id":"mininode"}' >/dev/null ||
    warn "AI Gateway not created; create 'mininode' in the dashboard (AI → AI Gateway)"
  echo "  created"
fi
echo "  AI_GATEWAY_BASE=https://gateway.ai.cloudflare.com/v1/$CLOUDFLARE_ACCOUNT_ID/mininode"

# ---------------------------------------------------------------------------------------------
log "R2 buckets"
for bucket in mininode-backups mininode-installers; do
  if cf GET "$ACC/r2/buckets/$bucket" >/dev/null 2>&1; then
    echo "  $bucket exists"
  else
    cf POST "$ACC/r2/buckets" "$(jq -nc --arg n "$bucket" '{name:$n,locationHint:"weur"}')" >/dev/null ||
      { warn "R2 failed: enable R2 once in the dashboard (R2 → Purchase/Enable), then re-run"; exit 1; }
    echo "  $bucket created"
  fi
done

# ---------------------------------------------------------------------------------------------
log "Tunnel $TUNNEL_NAME"
TUNNEL_ID=$(cf GET "$ACC/cfd_tunnel?name=$TUNNEL_NAME&is_deleted=false" | jq -r '.[0].id // empty')
if [ -z "$TUNNEL_ID" ]; then
  TUNNEL_ID=$(cf POST "$ACC/cfd_tunnel" \
    "$(jq -nc --arg n "$TUNNEL_NAME" '{name:$n,config_src:"cloudflare"}')" | jq -r '.id')
  echo "  created $TUNNEL_ID"
else
  echo "  exists $TUNNEL_ID"
fi
cf GET "$ACC/cfd_tunnel/$TUNNEL_ID/token" | jq -r '.' >"$OUT_DIR/TUNNEL_TOKEN"

# Service names resolve inside the compose network of infra/nucbox/compose.yml.
# Container apps (target nucbox) all enter through Traefik; DNS stays explicit per app
# (the deploy workflow creates <slug>.mininode.app → tunnel), so the ingress wildcard never
# exposes anything that has no DNS record.
INGRESS=$(jq -nc --arg d "$DOMAIN" '{config:{ingress:[
  {hostname:("remote."+$d),  service:"http://guacamole:8080", originRequest:{}},
  {hostname:("control."+$d), service:"http://nucbox-control:8080", originRequest:{}},
  {hostname:("ssh."+$d),     service:"ssh://host.docker.internal:22", originRequest:{}},
  {hostname:("*."+$d),       service:"http://traefik:80", originRequest:{}},
  {service:"http_status:404"}
]}}')
cf PUT "$ACC/cfd_tunnel/$TUNNEL_ID/configurations" "$INGRESS" >/dev/null
echo "  ingress updated"

# ---------------------------------------------------------------------------------------------
log "DNS for tunnel hostnames"
TARGET="$TUNNEL_ID.cfargotunnel.com"
for host in remote control ssh; do
  name="$host.$DOMAIN"
  existing=$(cf GET "$ZONE/dns_records?name=$name" | jq -r '.[0].id // empty')
  record=$(jq -nc --arg n "$name" --arg c "$TARGET" \
    '{type:"CNAME",name:$n,content:$c,proxied:true,comment:"mininode tunnel (bootstrap.sh)"}')
  if [ -n "$existing" ]; then
    cf PUT "$ZONE/dns_records/$existing" "$record" >/dev/null
  else
    cf POST "$ZONE/dns_records" "$record" >/dev/null
  fi
  echo "  $name → tunnel"
done

# ---------------------------------------------------------------------------------------------
log "Access service tokens"
service_token() { # name → id; writes client id/secret files on first creation
  local name=$1 id
  id=$(cf GET "$ACC/access/service_tokens" | jq -r --arg n "$name" '.[] | select(.name==$n) | .id' | head -1)
  if [ -z "$id" ]; then
    local created
    created=$(cf POST "$ACC/access/service_tokens" "$(jq -nc --arg n "$name" '{name:$n,duration:"8760h"}')")
    id=$(jq -r '.id' <<<"$created")
    jq -r '.client_id' <<<"$created" >"$OUT_DIR/$name.client_id"
    jq -r '.client_secret' <<<"$created" >"$OUT_DIR/$name.client_secret"
    echo "  $name created (secret in $OUT_DIR)" >&2
  else
    echo "  $name exists (secret only shown at creation; rotate in the dashboard if lost)" >&2
  fi
  echo "$id"
}
CI_TOKEN_ID=$(service_token github-deploy)
API_TOKEN_ID=$(service_token mininode-api)

log "Access applications"
access_app() { # name domain type session policies-json
  local name=$1 domain=$2 type=$3 policies=$4 id body
  id=$(cf GET "$ACC/access/apps" | jq -r --arg d "$domain" '.[] | select(.domain==$d) | .id' | head -1)
  body=$(jq -nc --arg n "$name" --arg d "$domain" --arg t "$type" --argjson p "$policies" '{
    name:$n, domain:$d, type:$t, session_duration:"12h",
    app_launcher_visible:false, auto_redirect_to_identity:false, policies:$p}')
  if [ -n "$id" ]; then cf PUT "$ACC/access/apps/$id" "$body" >/dev/null; else cf POST "$ACC/access/apps" "$body" >/dev/null; fi
  echo "  $domain"
}
owner_policy=$(jq -nc --arg e "$OWNER_EMAIL" \
  '{name:"owner",decision:"allow",include:[{email:{email:$e}}],precedence:1}')
token_policy() {
  jq -nc --arg id "$1" '{name:"service token",decision:"non_identity",include:[{service_token:{token_id:$id}}],precedence:2}'
}
access_app "NucBox SSH (deploy)" "ssh.$DOMAIN" ssh \
  "[$owner_policy,$(token_policy "$CI_TOKEN_ID")]"
access_app "nucbox-control" "control.$DOMAIN" self_hosted \
  "[$owner_policy,$(token_policy "$API_TOKEN_ID")]"
# remote.* stays outside Access: Guacamole runs with encrypted-JSON auth only (no admin UI,
# no user database), so every connection needs a short-lived token minted by the API Worker.

cat <<EOF

Done. Next steps (docs/runbooks/first-setup.md):
  • Copy $OUT_DIR/TUNNEL_TOKEN into infra/nucbox/secrets.env (TUNNEL_TOKEN=...).
  • GitHub secrets: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET ← github-deploy.*
  • API Worker secrets: wrangler secret put ACCESS_CLIENT_ID / ACCESS_CLIENT_SECRET (apps/api) ← mininode-api.*
  • GitHub variable AI_GATEWAY_BASE=https://gateway.ai.cloudflare.com/v1/$CLOUDFLARE_ACCOUNT_ID/mininode
  Then delete $OUT_DIR.
EOF
