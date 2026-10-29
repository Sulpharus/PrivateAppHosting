#!/usr/bin/env bash
# MiniNode desktop installer for Linux and macOS (Windows: install.ps1).
# Run it from the unpacked MiniNode folder. It needs Docker (with Compose) and nothing else:
# everything else, including Node and the database, runs in containers.
#
#   ./infra/desktop/install.sh [--dir ~/mininode] [--domain mininode.localhost] [--port 8787]
#                              [--lan] [--admin-email you@example.org] [--no-admin]
#
#   --dir          where the installation lives (settings, secrets, backups, your apps)
#   --domain       the name MiniNode answers to; *.localhost needs no setup on this computer
#   --port         the port in the address bar
#   --scheme       http (default) or https when a tunnel or reverse proxy adds HTTPS in front
#   --host-port    the port this computer listens on, if it differs from --port (e.g. --port 443 --host-port 8787 behind a tunnel)
#   --lan          reachable from other devices on your network (see docs/runbooks/setup-desktop.md:
#                  needs a wildcard DNS name for the domain, and plain http limits passkeys)
#   --admin-email  create the first account with this address (asks for a password)
#   --no-admin     skip creating an account
#   --ca-file      PEM certificate of a company proxy that re-signs HTTPS (the build downloads packages)
#
# Running it again on an existing installation rebuilds, restarts and migrates; it keeps all data
# and secrets.
set -euo pipefail

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
DIR="${HOME}/mininode"
DOMAIN=mininode.localhost
PORT=8787
HOST_PORT=
SCHEME=http
LAN=no
ADMIN_EMAIL=""
CA_FILE=""
ASK_ADMIN=yes
IMAGE=mininode-desktop-host:local

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR=${2:?--dir needs a folder}; shift 2 ;;
    --domain) DOMAIN=${2:?--domain needs a name}; shift 2 ;;
    --port) PORT=${2:?--port needs a number}; shift 2 ;;
    --host-port) HOST_PORT=${2:?--host-port needs a number}; shift 2 ;;
    --scheme) SCHEME=${2:?--scheme needs http or https}; shift 2 ;;
    --lan) LAN=yes; shift ;;
    --admin-email) ADMIN_EMAIL=${2:?--admin-email needs an address}; shift 2 ;;
    --no-admin) ASK_ADMIN=no; shift ;;
    --ca-file) CA_FILE=${2:?--ca-file needs a certificate file}; shift 2 ;;
    -h|--help) sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option $1 (try --help)" ;;
  esac
done

[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "the domain must be a plain host name, e.g. mininode.localhost"
[ "$SCHEME" = http ] || [ "$SCHEME" = https ] || die "--scheme must be http or https"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "the port must be a number from 1 to 65535"
[ -f "$SOURCE/infra/desktop/Dockerfile" ] || die "run this from an unpacked MiniNode folder ($SOURCE has no infra/desktop)"

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  case "$(uname -s)" in
    Darwin) die "Docker is not installed. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), start it, and run this again." ;;
    *) die "Docker is not installed. Install Docker Engine with the Compose plugin (https://docs.docker.com/engine/install/), and run this again." ;;
  esac
fi
docker info >/dev/null 2>&1 || die "Docker is installed but not running (or your user may not use it: see 'docker info')."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (the 'docker compose' command)."

fresh=yes
[ -f "$DIR/.env" ] && fresh=no
# Volumes of an earlier installation would keep its database passwords: new secrets would not fit.
if [ "$fresh" = yes ] && docker volume inspect mininode_db-data >/dev/null 2>&1; then
  die "an earlier MiniNode installation left its data (docker volume mininode_db-data) and this folder has no .env. Reinstall into the old folder, or delete the data first: docker compose -p mininode down --volumes"
fi

# 2. The port must be free, unless this installation already uses it.
check_port=${HOST_PORT:-$PORT}
if [ "$fresh" = yes ] && (exec 3<>"/dev/tcp/127.0.0.1/$check_port") 2>/dev/null; then
  die "port $check_port is already in use on this computer; choose another with --port (or --host-port)"
fi

say "Installing MiniNode into $DIR"
mkdir -p "$DIR/hosted"
chmod 700 "$DIR"

# 3. A copy of the source next to the settings, so the installation does not depend on this folder.
rm -rf "$DIR/source.next"
mkdir "$DIR/source.next"
(cd "$SOURCE" && tar --exclude=node_modules --exclude=.git --exclude=hosted --exclude=inbox --exclude=e2e -cf - .) | (cd "$DIR/source.next" && tar xf -)
rm -rf "$DIR/source"
mv "$DIR/source.next" "$DIR/source"
cp "$DIR/source/infra/desktop/compose.yml" "$DIR/compose.yml"
cp "$DIR/source/infra/desktop/mininode-desktop" "$DIR/mininode-desktop"
chmod +x "$DIR/mininode-desktop"

# 4. The image (portal, API, AI proxy, gates, command line). The first build takes several minutes.
say "Building MiniNode (first time: several minutes)…"
build_args=()
[ -n "$CA_FILE" ] && { [ -f "$CA_FILE" ] || die "$CA_FILE not found"; build_args=(--secret "id=ca,src=$CA_FILE"); }
docker build -q -f "$DIR/source/infra/desktop/Dockerfile" -t "$IMAGE" ${build_args[@]+"${build_args[@]}"} "$DIR/source" >/dev/null

# 5. Secrets and configuration, made on this computer.
if [ "$fresh" = yes ]; then
  lan_flag=(--scheme "$SCHEME")
  [ "$LAN" = yes ] && lan_flag+=(--lan)
  [ -n "$HOST_PORT" ] && lan_flag+=(--host-port "$HOST_PORT")
  docker run --rm -u "$(id -u):$(id -g)" -v "$DIR:/out" -w /app "$IMAGE" \
    node packages/cli/src/bin.ts desktop init --out /out --domain "$DOMAIN" --port "$PORT" ${lan_flag[@]+"${lan_flag[@]}"}
  printf "MININODE_SOURCE='./source'\n" >> "$DIR/.env"
fi

# 6. Start, migrate, first account.
"$DIR/mininode-desktop" start
"$DIR/mininode-desktop" migrate

if [ "$fresh" = yes ] && [ "$ASK_ADMIN" = yes ]; then
  if [ -z "$ADMIN_EMAIL" ]; then
    [ -t 0 ] || die "no terminal to ask for the first account: pass --admin-email and set MININODE_ADMIN_PASSWORD, or --no-admin"
    read -r -p "Email address of the first account (it becomes the admin): " ADMIN_EMAIL
  fi
  "$DIR/mininode-desktop" admin "$ADMIN_EMAIL"
fi

url="$("$DIR/mininode-desktop" url)"
say ""
say "MiniNode is installed and running."
say "  Open:      $url/login"
say "  Control:   $DIR/mininode-desktop  (start, stop, status, logs, add <app>, backup, update)"
say "  Secrets:   $DIR/.env  (private to you; back it up, losing it means losing the data)"
say "MiniNode starts again by itself when Docker starts. Next: docs/runbooks/setup-desktop.md"
