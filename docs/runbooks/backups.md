# Backups

A full backup of the platform from Verwaltung → Sicherung (ADR 0019): all accounts (with
passwords and passkeys), the data of the platform and of every app, the stored files and the hosting
settings, in one password-protected file you keep yourself. The NucBox keeps its own nightly
backups (`restore.md`); this one does not depend on it.

## One-time setup

1. **Passphrase.** GitHub → Settings → Environments → `production` → *Add secret*:
   `BACKUP_PASSPHRASE`, at least 16 characters (a few random words is fine, spaces are kept).
   Put the same text in your password manager now: **without it a backup cannot be opened, by
   nobody**.
2. These already exist from the first setup and are reused: `SUPABASE_DB_URL` (Session pooler),
   `SUPABASE_SECRET_KEY` (secrets of the environment `production`) and `LIBRARY_DISPATCH_TOKEN`
   (Actions: read and write; it starts the workflow and reads the archive list).
3. Merge to `main`: workflows only run from there.

## Make and download one

1. Verwaltung → **Sicherung** → *Sicherung erstellen*. Untick the files box for a quick copy of the
   data only. It takes a few minutes; the row shows *Läuft*, then *Fertig* with the size.
   (By hand: GitHub → Actions → *Sicherung* → *Run workflow*.)
2. *Herunterladen*. The browser gets a ZIP with one `.7z` file in it; open that with
   [7-Zip](https://www.7-zip.org/) and the passphrase (`7z x mininode-backup-….7z` elsewhere). The
   download link is valid for a minute; the archive stays on GitHub for 30 days.
3. Keep the file somewhere that is neither GitHub nor Supabase (an external drive, your cloud
   drive), and check it: `pnpm mininode backup verify <extracted folder>` compares every file with
   its checksum.

GitHub Free allows 500 MB of artifacts in total: download the backup, then delete old ones under
Actions if the quota fills (a failed run says so).

## What is inside

| Part | Content |
| --- | --- |
| `database/data.dump` | Rows of `platform`, all `app_*` schemas and the accounts (`auth.users`, identities, second factors, passkeys), PostgreSQL custom format, data only |
| `storage/` | Bucket settings and all files: app files (photos, receipts), uploads, logos |
| `settings/` | Readable JSON: apps, grants, categories, API services (no keys), budgets, profiles, accounts, deployment facts |
| `manifest.json` | Tables and row counts, migrations, commit, SHA-256 of every file |
| `README-RESTORE.txt` | Short version of this page |

**Not inside:** the Worker and GitHub secrets (they cannot be read back; keep them in the password
manager: `SUPABASE_SECRET_KEY`, `VAULT_KEY`, `GOOGLE_TOKEN_KEY`, `VAPID_*`, `GUACAMOLE_JSON_SECRET`,
`NUCBOX_CONTROL_TOKEN`, …, the list in `apps/api/wrangler.jsonc` and `key-rotation.md`), the code of
the apps (git), the NucBox and the Windows VM (`restore.md`). Keys that people stored in
Verwaltung → API-Schlüssel are in the database, encrypted with `VAULT_KEY`: **keep `VAULT_KEY` and
`GOOGLE_TOKEN_KEY`, or those keys and Google links are unreadable after a restore.**

Treat the backup like the passwords it contains: it holds every person's data.

## Restore

What you need on your computer: this repository (`pnpm install`), Docker (or the PostgreSQL client
tools in the version of the server, 17), and in the environment:

```bash
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SECRET_KEY=sb_secret_…
export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-….pooler.supabase.com:5432/postgres'  # Session pooler
```

### Roll back the running project

```bash
pnpm mininode backup verify  ./backup            # is it complete?
pnpm mininode backup restore ./backup            # shows what would change, changes nothing
pnpm mininode backup restore ./backup --yes      # does it
```

Every table in the backup is emptied and refilled in **one transaction** (a failure changes
nothing), the triggers do not run, the files are uploaded again (same name = replaced). Afterwards
the row counts are compared. Everybody has to sign in again (sessions are not part of a backup);
passwords, second factors and passkeys still work. `--no-database` / `--no-storage` restore only one
half.

### Into a new Supabase project (the old one is gone)

1. Create the project, put its URL, keys and `SUPABASE_DB_URL` into the GitHub secrets, the Worker
   secrets and `wrangler.jsonc`/`first-setup.md` as in the first setup (§1 to §4); re-enter the
   secrets from your password manager.
2. Run the deploy workflow with *all apps*: it applies the migrations and creates the app schemas.
3. In the Supabase dashboard switch the Auth hooks (custom access token, send email) and the Google
   provider on again (`first-setup.md` §3).
4. Restore as above (`--yes`). If it stops with "lacks migrations" or "lacks tables", the deploy of
   step 2 did not finish for that app; fix it and run the restore again, nothing was changed.
5. Check the portal, then a hosted app with files.

`--force` restores although migrations or tables are missing; only use it knowing which data then
stays out.

## Limits

- Created on the running platform: the database part is one consistent snapshot, the files are
  copied right after it, so a file saved in between can be newer than the rows.
- Verified against the local Supabase stack (`pnpm test:roundtrip`: accounts with password, rows,
  files). The hosted project is assumed to give the `postgres` role the rights to truncate the
  `auth` tables and to set `session_replication_role` [?]: do a drill into a staging project
  (`--env staging` secrets) before you rely on it, and again after big platform changes.
- No schedule yet. When you want one, add a `schedule:` trigger to `backup.yml`; each run adds an
  archive to the quota.
