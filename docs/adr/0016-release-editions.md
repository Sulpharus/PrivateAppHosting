# ADR 0016: Release editions

- Status: accepted
- Date: 2026-10-01

## Context

The platform has two halves: the cloud (Cloudflare, Supabase) and the home server (the PC/server
side, called NucBox). The owner wants both downloadable together and separately, per version, from
GitHub.

## Decision

`scripts/package-release.sh <version>` builds three archives from the committed files
(`git archive`, no secrets or untracked files) plus `SHA256SUMS`:

- `mininode-cloud-<version>.zip`: everything except the home-server parts (`infra/nucbox`,
  `apps/nucbox-control`, the NucBox SSH action).
- `mininode-pc-server-<version>.zip`: the NucBox side, self-contained (compose stack, deploy
  command, backups, Windows/Wine setup, `nucbox-control` with the workspace packages it builds
  from, the runbooks it needs). CI proves the content; `pnpm install --frozen-lockfile` and the
  control build work from the archive alone.
- `mininode-complete-<version>.zip`: the whole repository.

Each carries `VERSION` (version, edition, commit) and a `README-EDITION.md` that says what it is,
which operating systems it targets and how it relates to the other edition.

`release.yml` publishes them on a tag: `v1.2.0` builds all three, `cloud-v1.2.0` or
`pc-server-v1.2.0` only that edition, so each edition can have its own version line. It can also
be run by hand for an existing tag.

## Consequences

- The PC/server edition is the NucBox half, not a second complete platform: it needs the Cloud
  edition (portal, API, database) to be useful. Its README says so.
- Operating systems: the PC/server edition targets Proxmox VE 9 on the PC with a Linux VM and an
  optional Windows 11 VM. Other systems are not supported for the host (see the edition README).
- Packages contain the owner's instance settings (project references, public keys); they are for
  this installation. Making a clean public template is a separate, proposed step (PLAN §15.2).
