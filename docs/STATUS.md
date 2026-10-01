# Status and handoff

Where things stand, what the owner still has to do, and what a new session should know.
Update it at the end of every working session; history belongs in git, not here.

Last updated: 2026-10-01 (after the merge of PR #12).

## Recently shipped

| Area | What | Where |
| --- | --- | --- |
| Suite core | Shared records, collections, app type grants, `mn.suite` | ADR 0002, `docs/suite/data-types.md` |
| Kalender | Views, own events, recurrence, reminders, sources, ICS, shared calendars | `hosted/kalender`, runbook `kalender.md` |
| Google Calendar | Two-way sync with a "MiniNode" calendar | ADR 0010 |
| Haushalt | Fixed costs (end date, amount changes, statement matching), "Dein Monat", statistics, PDF statement import (pdf.js vendored) | `hosted/haushalt` |
| Kalender sources | Sportplaner sessions (`activity`) and Haushalt payments (`contract`) as suite records | `hosted/sportplaner/js/suite.js`, `hosted/haushalt/plan.js` |
| App-Bibliothek | Jellyfin, n8n, Uptime Kuma, Stirling PDF on the NucBox with one click | ADR 0011, runbook `app-library.md` |
| App export | An app as its own GitHub repository, without data or keys | ADR 0012, runbook `app-export.md` |
| Deploys | One failing app no longer stops the others | `.github/workflows/deploy.yml`, `mininode deploy --changed` |

Since then: games show only in the Gaming Hub (the start page's "Gaming Hub" button and the
"Spiele" tab are always there). A Sportplaner course can carry a price or monthly fee, which is
split over the sessions that take place.

The Sportplaner map (tab "Karte") and course mode (editor step "Zeiten" → "Kurs") were built in
PR #10. They only reached production with the PR #12 deploy, because earlier deploys stopped
at medialog.

## Waiting on the owner

1. `SUPABASE_DB_URL` in the GitHub environment `production` → the Session pooler string
   (`…pooler.supabase.com:5432`). Until then the deploys of medialog and wunschliste fail
   (IPv6-only direct connection). The other apps deploy anyway.
2. Approve the suite requests under Verwaltung → Gemeinsame Daten:
   - Kalender: event delete, the other types read;
   - Sportplaner: activity write;
   - Haushalt: contract write.
3. Connect Google with calendar access under "Dein Konto" (Google Calendar sync).
4. NucBox setup (`nucbox-install.md`): `vars.NUCBOX_TUNNEL_ID`, deploy SSH key, Access
   secrets. Container apps and the App-Bibliothek need it.
5. GitHub tokens:
   - `LIBRARY_DISPATCH_TOKEN`: Actions write, this repository. Starts the library and export
     workflows.
   - `CATALOG_TOKEN`: Contents read, this repository. Goes into `/etc/mininode/deploy.env` on
     the NucBox.
   - `EXPORT_REPO_TOKEN`: Administration + Contents write, all repositories.
   - See `app-library.md` and `app-export.md`.
6. Pick a license before sharing an exported app.

## Open and proposed work

- **Sharing the whole platform** (PLAN §15.2): proposed, the owner has not decided yet.
  - Next steps would be to move instance settings into one `mininode.config.json`, then
    generate a clean public template repository.
- **"Aether Notes":** the owner mentioned a ZIP to integrate. It never arrived (`inbox/` was
  empty). Ask for it.
- **App-Bibliothek entries are untested on real hardware.** Stirling PDF may need its own
  user or root. The health check rolls back a failed start.
- **PDF import was tested with generated statements only.** Ask for a redacted real one if a
  bank's layout is not recognised.
- **Haushalt changes not visible to the owner:** it was a cached PWA version. Tell them to
  reload or reopen the app.

## Working in this repository (cloud sessions)

- **Local stack.**
  - Start it with `scripts/cloud-stack.sh`, then `pnpm exec supabase db reset --local`.
  - The container restarts now and then. Run both again when `docker ps` fails.
  - Integration tests: `scripts/with-local-supabase.sh pnpm --filter <pkg> exec vitest run <file>`.
  - e2e: `pnpm e2e <spec>`.
- **Stale dev servers.**
  - Find them with `ps -eo pid,args | grep -E "[w]rangler|[b]in.ts dev|[v]ite"` and kill them
    by PID.
  - `pkill -f` with a pattern can kill your own shell.
- **Before pushing** anything non-trivial, run the `reviewer` subagent on the diff and fix
  what it reports.
  - The reviews so far found real problems: the env-file expansion, symlinks in exports, and
    unscanned binaries.
- **Secret scan.**
  - gitleaks runs over every commit of a PR.
  - Fake keys in tests must be built at runtime, e.g. `['eyJ…', '…'].join('.')`.
  - Findings already pushed go into `.gitleaksignore` by fingerprint.
- **Git.**
  - Never force-push or rewrite history.
  - Never merge without the owner's explicit "mergen".
  - After a merge, restart the branch from `origin/main`.
- **Network.**
  - `*.mininode.app` cannot be reached from the container (proxy 403).
  - To check a deploy, use the GitHub Actions job logs.
  - Docker Hub, `registry-1.docker.io` and `hub.docker.com` work, e.g. for pinning image
    digests.
- **Owner preferences.**
  - Reply in German, unless they write English.
  - Be direct and concise.
  - Confirm before destructive steps.
  - Document in the repo (PLAN.md, ADRs, runbooks, this file), not in the Obsidian KB.
