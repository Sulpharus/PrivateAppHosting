#!/usr/bin/env bash
# Builds the starter ZIP: the platform for every variant, without apps and without anything of
# this installation (domain, accounts, keys, people). Used by scripts/package-release.sh.
#
#   scripts/make-starter.sh <version> <outdir>
#
# Steps: export the committed files, drop the apps and personal files, write neutral placeholders
# into the instance settings, regenerate the lockfile without the apps, then scan the result for
# every identifier of this installation. A hit stops the build: nothing private ships.
set -euo pipefail
cd "$(dirname "$0")/.."

version=${1:?usage: make-starter.sh <version> <outdir>}
out=${2:?usage: make-starter.sh <version> <outdir>}
[[ "$version" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] || { echo "invalid version: $version" >&2; exit 1; }
command -v zip >/dev/null || { echo "zip is required" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "pnpm is required (the lockfile is regenerated without the apps)" >&2; exit 1; }

name="mininode-starter-$version"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
stage="$work/$name"
mkdir -p "$stage" "$out"
out=$(cd "$out" && pwd -P)

# 1. The committed files only: no untracked files, no history, no node_modules.
git archive HEAD | tar -x -C "$stage"

# 2. Identifiers of this installation, read before anything is replaced.
identifiers=()
if [ -f mininode.config.json ]; then
  while IFS= read -r line; do [ -n "$line" ] && identifiers+=("$line"); done < <(jq -r '
    [.cloudflare.accountId, .github.repository, (.github.repository // "" | split("/")[0]),
     (.environments[] | .domain, .supabase.projectRef, .supabase.publishableKey), .zone, .mailFrom]
    | .[] | select(. != null and . != "")' mininode.config.json)
fi
# Everyone who ever committed: names and addresses (public no-reply addresses and bots excluded).
while IFS= read -r line; do
  line=${line//[$'\r']/}
  [ "${#line}" -ge 5 ] || continue
  case "$line" in *noreply*|*'[bot]'*|Claude*|GitHub*|mininode-*) continue ;; esac
  identifiers+=("$line")
done < <(git log --format='%ae%n%ce%n%an%n%cn' | sort -u)

# 3. No apps, no personal or generated files.
find "$stage/hosted" -mindepth 1 -delete
cat > "$stage/hosted/README.md" <<'README'
# hosted/

One folder per app, each with a `mininode.json`. This copy starts empty: build an app with the
KI-Werkstatt (Verwaltung), integrate it (`docs/runbooks/add-app.md`, `docs/runbooks/uploads.md`),
and it appears here. The desktop edition installs apps with `mininode-desktop add <app>`.
README
find "$stage/inbox" -mindepth 1 ! -name '.gitkeep' ! -name 'README.md' -delete
rm -rf "$stage/graphify-out" "$stage/.gitleaksignore" "$stage/docs/STATUS.md"
# End-to-end specs of the apps go with the apps; the generic ones stay.
for spec in "$stage"/e2e/*.spec.ts; do
  [ -f "$spec" ] || continue
  if grep -qE 'hosted/|:(879[1-9]|88[0-9][0-9])|kalender|haushalt|sportplaner|sudoku|wunschliste|medialog|aether|splitter|localhost.*games' "$spec"; then rm -f "$spec"; fi
done
cat > "$stage/docs/STATUS.md" <<'STATUS'
# Status and handoff

Where this installation stands, what is still to do, and what a new working session should know.
Update it at the end of every working session; history belongs in git, not here.

Last updated: (date)

## Start here

1. Read `CLAUDE.md` (rules, commands), then this file. Before structural changes read `PLAN.md` and
   `docs/adr/`.
2. Set the installation up with `docs/runbooks/getting-started.md`.

## Done

(nothing yet)

## Waiting on the owner

(your open steps)

## Open and proposed work

(ideas, known gaps)
STATUS
cp infra/release/README-starter.md "$stage/README-EDITION.md"
printf '%s\nedition: starter\ncommit: %s\n' "$version" "$(git rev-parse HEAD)" > "$stage/VERSION"
# The instance settings are made by `pnpm mininode init`; the example shows their shape.
rm -f "$stage/mininode.config.json"

# 4. Neutral placeholders in the files `mininode configure` renders.
node packages/cli/src/bin.ts configure --root "$stage" --config "$stage/mininode.config.example.json" >/dev/null

# 5. Prose that names the example installation reads as an example domain and repository.
# (replacements come from the installation's own settings, so this script names none of them)
sed_args=()
for domain in $(jq -r '[.environments[].domain] | .[] | select(. != null)' mininode.config.json 2>/dev/null); do
  sed_args+=(-e "s#hallo@$domain#hello@example.com#g" -e "s#$domain#example.com#gI")
done
repository=$(jq -r '.github.repository // empty' mininode.config.json 2>/dev/null || true)
if [ -n "$repository" ]; then
  sed_args+=(-e "s#$repository#your-name/your-repository#g" -e "s#${repository%%/*}#your-name#gI")
fi
if [ "${#sed_args[@]}" -gt 0 ]; then
  while IFS= read -r -d '' file; do sed -i "${sed_args[@]}" "$file"; done \
    < <(find "$stage" -type f \( -name '*.md' -o -name '*.mdx' \) -not -path '*/node_modules/*' -print0)
fi

# 6. The lockfile without the apps (they are the only workspace members that left).
(cd "$stage" && pnpm install --lockfile-only --ignore-scripts >/dev/null)

# 7. Leak check: every identifier of this installation, anywhere in the result.
leaks=0
for id in "${identifiers[@]}"; do
  if hits=$(grep -rilF --exclude-dir=node_modules -e "$id" "$stage" 2>/dev/null) && [ -n "$hits" ]; then
    printf 'LEAK: "%s" is still in:\n%s\n' "$id" "${hits//$stage\//  }" >&2
    leaks=1
  fi
done
[ "$leaks" -eq 0 ] || { echo "the starter still contains identifiers of this installation; nothing was written" >&2; exit 1; }

# 8. Pack. Fixed timestamps would make it reproducible; the commit id in VERSION identifies it.
rm -f "$out/$name.zip"
(cd "$work" && zip -qr -X "$out/$name.zip" "$name")
echo "built $out/$name.zip ($(du -h "$out/$name.zip" | cut -f1), ${#identifiers[@]} identifiers checked)"
