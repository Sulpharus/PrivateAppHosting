#!/usr/bin/env bash
# Runs nucbox-deploy against stubbed docker, gh and chown and compares the generated compose
# files with testdata/. Update the golden files with: UPDATE=1 infra/nucbox/deploy/test.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/root/platform"
echo "SUPABASE_URL=https://example.supabase.co" >"$work/root/platform/apps.env"

cat >"$work/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >>"$STUB_LOG"
if [ "$1 $2" = "image inspect" ]; then
  echo '{"slug":"rezepte","target":"nucbox","container":{"port":3000,"memoryMb":256,"healthPath":"/health"}}'
fi
[ "${FAIL_PROBE:-}" = 1 ] && [ "$1" = exec ] && exit 1
exit 0
EOF
cat >"$work/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = api ]; then cat "$CATALOG"; fi
exit 0
EOF
printf '#!/usr/bin/env bash\necho "chown $*" >>"$STUB_LOG"\n' >"$work/bin/chown"
# The probe waits 2 s between tries; nothing to wait for here.
printf '#!/usr/bin/env bash\nexit 0\n' >"$work/bin/sleep"
chmod +x "$work/bin/"*

export PATH="$work/bin:$PATH" MININODE_ROOT="$work/root" STUB_LOG="$work/log" \
  CATALOG="$repo/infra/nucbox/library.json" GH_TOKEN=test
deploy() { bash "$here/nucbox-deploy" "$@" 2>>"$work/stderr"; }
fail() { echo "FAIL: $*" >&2; cat "$work/stderr" >&2; exit 1; }
golden() { # generated golden-name
  if [ "${UPDATE:-}" = 1 ]; then cp "$1" "$here/testdata/$2"; fi
  diff -u "$here/testdata/$2" "$1" || fail "$2 differs"
}
digest=sha256:$(printf 'a%.0s' {1..64})

# Hosted container app: own image, fixed hardening.
deploy rezepte "$digest" || fail "hosted rollout"
golden "$work/root/apps/rezepte/compose.yml" hosted.compose.yml

# Library program: entry from the catalog, env single-quoted, marker after a healthy start.
deploy library kino jellyfin || fail "library install"
golden "$work/root/apps/kino/compose.yml" library.compose.yml
golden "$work/root/apps/kino/library.env" library.env
[ "$(cat "$work/root/apps/kino/library")" = jellyfin ] || fail "library marker"

# Refusals.
! deploy library kino n8n || fail "switching the entry of an address"
! deploy kino "$digest" || fail "hosted rollout onto a library address"
! deploy library rezepte jellyfin || fail "library install onto a hosted address"
! deploy library kino nope || fail "unknown entry"
! deploy library 'Ki;no' jellyfin || fail "invalid slug"
! deploy remove rezepte || fail "removing a hosted app"
mkdir -p "$work/root/apps/evil/data" && ln -s / "$work/root/apps/evil/data/config"
! deploy library evil jellyfin || fail "following a planted symlink"
grep -q "chown.* /$" "$work/log" && fail "chown on /"

# A failed first install leaves no marker behind.
FAIL_PROBE=1 deploy library uptime uptime-kuma && fail "unhealthy install succeeded"
[ ! -f "$work/root/apps/uptime/library" ] || fail "marker after a failed install"

# Remove keeps the data; installing again works.
deploy remove kino || fail "remove"
[ -d "$work/root/apps/kino/data/config" ] && [ ! -f "$work/root/apps/kino/compose.yml" ] ||
  fail "remove state"
deploy library kino jellyfin || fail "reinstall"

echo "nucbox-deploy: all checks passed"
