#!/usr/bin/env bash
# Builds the downloadable packages of a release from the committed files (git archive: no
# secrets, no untracked files, no node_modules).
#
#   scripts/package-release.sh <version> [outdir] [edition...]
#
# Editions: cloud, pc-server, complete (default: all three).
#   cloud       platform for Cloudflare + Supabase, without the home-server parts
#   pc-server   the NucBox side: compose stack, nucbox-control, deploy, backups, runbooks
#   complete    the whole repository
# Output: mininode-<edition>-<version>.zip per edition and SHA256SUMS.

set -euo pipefail
cd "$(dirname "$0")/.."

version=${1:?usage: package-release.sh <version> [outdir] [edition...]}
out=${2:-release-out}
editions=("${@:3}")
[ ${#editions[@]} -gt 0 ] || editions=(cloud pc-server complete)
[[ "$version" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] || { echo "invalid version: $version" >&2; exit 1; }

# Only the PC/server edition keeps these; the cloud edition leaves them out.
PC_ONLY=(infra/nucbox apps/nucbox-control .github/actions/nucbox-ssh)
# What the PC/server edition needs to be installed, built and understood on its own.
PC_FILES=(
  "${PC_ONLY[@]}"
  infra/release/README-pc-server.md
  packages/gate packages/config packages/manifest
  docs/runbooks/nucbox-install.md docs/runbooks/app-library.md docs/runbooks/restore.md
  docs/runbooks/key-rotation.md docs/adr/0011-app-library.md
  package.json pnpm-workspace.yaml pnpm-lock.yaml biome.json turbo.json .nvmrc
)

mkdir -p "$out"
commit=$(git rev-parse HEAD)
for edition in "${editions[@]}"; do
  name="mininode-$edition-$version"
  zip="$out/$name.zip"
  rm -f "$zip"
  tmp=$(mktemp -d)
  printf '%s\nedition: %s\ncommit: %s\n' "$version" "$edition" "$commit" > "$tmp/VERSION"
  case "$edition" in
    cloud)
      cp infra/release/README-cloud.md "$tmp/README-EDITION.md"
      excludes=()
      for path in "${PC_ONLY[@]}"; do excludes+=(":(exclude)$path"); done
      git archive --format=zip --prefix="$name/" --add-file="$tmp/VERSION" \
        --add-file="$tmp/README-EDITION.md" -o "$zip" HEAD -- . "${excludes[@]}" ":(exclude)infra/release"
      ;;
    pc-server)
      cp infra/release/README-pc-server.md "$tmp/README-EDITION.md"
      git archive --format=zip --prefix="$name/" --add-file="$tmp/VERSION" \
        --add-file="$tmp/README-EDITION.md" -o "$zip" HEAD -- "${PC_FILES[@]}"
      ;;
    complete)
      git archive --format=zip --prefix="$name/" --add-file="$tmp/VERSION" -o "$zip" HEAD
      ;;
    *) echo "unknown edition: $edition" >&2; exit 1 ;;
  esac
  rm -rf "$tmp"
  echo "built $zip ($(du -h "$zip" | cut -f1))"
done

(cd "$out" && sha256sum mininode-*-"$version".zip > SHA256SUMS)
cat "$out/SHA256SUMS"
