#!/usr/bin/env bash
# Usage in GitHub Actions: scripts/ci-clean-secret.sh NAME [regex] [hint]
# Strips whitespace/quotes that often sneak into pasted secrets, checks the format (without
# printing the value) and exports the cleaned value to later steps of the job.
set -euo pipefail
name=$1 pattern=${2:-} hint=${3:-}
raw=${!name:-}
clean=$(printf '%s' "$raw" | tr -d '[:space:]"'"'")
if [ -z "$clean" ]; then
  echo "::error::$name is not set (docs/runbooks/first-setup.md, step 3)"
  exit 1
fi
if [ -n "$pattern" ] && ! [[ $clean =~ $pattern ]]; then
  echo "::error::$name has an unexpected format (length ${#clean}, starts with '${clean:0:4}'). $hint"
  exit 1
fi
echo "::add-mask::$clean"
if [ "$clean" != "$raw" ]; then echo "::notice::$name contained whitespace or quotes; they were removed"; fi
echo "$name=$clean" >> "$GITHUB_ENV"
