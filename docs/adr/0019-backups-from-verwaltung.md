# ADR 0019: Backups from Verwaltung

- Status: accepted
- Date: 2026-10-05

## Context

The only backup was the nightly restic job on the NucBox (`infra/nucbox/backup`), which exists
only once the NucBox is set up and cannot be started or downloaded from the portal. The owner wants
one place, Verwaltung, to create a full backup of everything that matters (the accounts and data of
all users, the stored files, the hosting settings), keep it themselves and restore from it later.

## Decision

- **A workflow does the work** (`.github/workflows/backup.yml`, environment `production`), started
  from Verwaltung → Sicherung through the API (`POST /admin/backups`, admin, recent sign-in) or by
  hand under Actions. A Worker cannot do it: CPU and memory limits, and a consistent snapshot needs
  `pg_dump`.
- **The folder** (`mininode backup create`, `packages/cli/src/backup`):
  - `database/data.dump`: `pg_dump --data-only` (custom format) of `platform`, every `app_*` schema
    and the sign-in accounts (`auth.users`, `identities`, `mfa_factors`, `webauthn_credentials`:
    password hashes and passkeys come back, so nobody has to reset anything). Sessions, tokens and
    the sign-in service's own bookkeeping are left out.
  - `storage/`: bucket settings and every file (`files/<bucket>/<path>`, names percent-encoded).
  - `settings/`: readable JSON of the hosting settings (apps, grants, categories, API services,
    budgets, profiles) without keys or hashes, the list of accounts, the deployment facts.
  - `manifest.json`: tables with row counts, applied migrations, commit, a SHA-256 for every file.
- **Data only.** The structure (tables, RLS, grants) is the migrations' business, the source of
  truth tested by pgTAP. A restore therefore cannot loosen a policy; it needs a target at the
  backup's migration level (and the apps deployed, which create their own schemas).
- **Encryption** is a standard 7z archive with AES-256 and encrypted headers
  (`BACKUP_PASSPHRASE`, a GitHub secret of at least 16 characters that the owner also keeps in a
  password manager). 7-Zip opens it on any system; no custom crypto, no tool of ours needed to read
  it. The passphrase is never entered in the portal or logged.
- **Hand-over.** The archive is an Actions artifact (kept 30 days, stored uncompressed). The API
  lists the runs with their archives (`GET /admin/backups`) and hands out the short-lived signed
  address GitHub gives for the artifact (`POST /admin/backups/:id/download`, audit-logged); the file
  goes from GitHub to the browser, not through the Worker. Only artifacts named `mininode-backup-*`
  are offered.
- **Restore** is a command on the owner's computer, not a button (`mininode backup restore`,
  runbook `backups.md`). Without `--yes` it only prints the plan. It refuses a damaged folder
  (checksums), a target that lacks migrations or tables, and checks the row counts afterwards. The
  database part runs in one transaction with triggers off (`session_replication_role = replica`),
  so a failure changes nothing; files are uploaded again with upsert.
- **Not included**, on purpose: secrets of the Workers and GitHub (they cannot be read back and do
  not belong in an archive), the code of the apps (git), the NucBox and Windows VM (restic and
  Proxmox, `restore.md`).

## Consequences

- One button creates, one downloads; the restore is tested by a round trip against the local
  Supabase stack (`pnpm test:roundtrip`, in CI, on its own because it empties the database).
- The artifact quota of the GitHub plan limits how many archives fit; the page shows the size, the
  owner downloads and keeps them elsewhere. A copy into R2 (`mininode-backups`) or a schedule is a
  small addition when wanted.
- Created while the platform runs: the database part is one consistent snapshot, the files are
  copied right after it, so a file written in between can be newer than the rows.
- Restoring into the hosted Supabase project depends on the `postgres` role being allowed to
  truncate the `auth` tables and set `session_replication_role`; verified locally only. A restore
  drill into a staging project belongs in the runbook for that reason.
