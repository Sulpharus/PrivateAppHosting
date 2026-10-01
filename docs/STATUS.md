# Status and handoff

Where things stand, what the owner still has to do, and what a new session should know.
Update it at the end of every working session; history belongs in git, not here.

Last updated: 2026-10-01.

## Start here

1. Read `CLAUDE.md` (rules, commands), then this file. Before structural changes, read
   `PLAN.md` (architecture; §15.1 lists everything built beyond the phases) and `docs/adr/`.
2. Find code fast with the knowledge graph (`pnpm kb`, then `graphify query "…"`). See
   `CLAUDE.md`.
3. Start the local stack (see "Working in this repository" below). Then:
   - `pnpm check` before every commit;
   - `pnpm db:test` when `supabase/` changes;
   - `pnpm e2e <spec>` for the app you touched.
4. Before pushing anything non-trivial, run the `reviewer` subagent on the diff and fix what
   it reports.
5. Work only on the session's designated branch, and open a draft PR. Never merge without the
   owner's explicit "mergen".

Where things are documented:

| Topic | Read |
| --- | --- |
| Architecture, phases, data model | `PLAN.md` |
| Decisions | `docs/adr/0001`–`0012` |
| Operations: setup, NucBox, keys, Kalender, App-Bibliothek, app export, restore | `docs/runbooks/` (index in its README) |
| Building apps with AI: spec, design system, prompt modules, playbooks | `docs/ai/` |
| Shared data types (suite) | `docs/suite/data-types.md` |
| Each app and package | its `README.md` |

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
| Gaming Hub | Games show only in the hub; the start page's "Gaming Hub" button and "Spiele" tab are always there | ADR 0009, `apps/portal/src/routes/Home.tsx` |
| Sportplaner course price | Whole course or monthly fee, split over the sessions that take place, booked per session in Statistik | `hosted/sportplaner/js/price.js`, README |
| German formats | Date, month and time inputs as German parts in every browser; full dates as "01. Okt. 2026"; German numbers | `packages/ui/kit/ui.js`, `docs/ai/DESIGN-SYSTEM.md` §8 |

The Sportplaner map (tab "Karte") and course mode (editor step "Zeiten" → "Kurs") are live
since the PR #12 deploy. Earlier deploys stopped at medialog and never shipped them.

## Conventions worth knowing

- **German formats everywhere.** The owner wants this strictly.
  - A full date is "01. Okt. 2026": `mnui.date.format(iso)`, or `Intl.DateTimeFormat('de-DE',
    { day: '2-digit', month: 'short', year: 'numeric' })`.
  - Times use 24 hours. Amounts look like "1.234,50 €", and typed amounts are read the German
    way.
  - Never show ISO dates or `dd.mm.yyyy` to users.
- **Date and time inputs** stay plain `<input type="date|month|time">`. The kit (`ui.js`, also
  loaded by the Sportplaner just for this) shows them as Tag · Monat · Jahr or
  Stunde : Minute.
  - e2e can still `.fill('2026-10-01')` the input found by its label.
  - To pick values like a person: `locator('.mn-date').getByRole('combobox', { name: 'Monat' })`.
- **Apps that load the kit:** haushalt, kalender, wunschliste, memory and medialog load
  `ui.css` and `ui.js`. The Sportplaner has its own styles and loads only `ui.js`.
- **Plain-script apps** (sportplaner, haushalt) share one global scope per page. Testable pure
  logic goes into its own file:
  - Sportplaner: `js/price.js`, tested by reading and evaluating the file in Vitest.
  - Haushalt: ES modules.

## Waiting on the owner

1. `SUPABASE_DB_URL` in the GitHub environment `production` → the Session pooler string
   (`…pooler.supabase.com:5432`). Until then the deploys of medialog and wunschliste fail
   (IPv6-only direct connection). The other apps deploy anyway. Afterwards, run Deploy by hand
   with "all_apps".
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
- **Kalender "403 Forbidden" (2026-10-01):** the owner found and fixed the cause outside the
  code.
  - Useful to know: the gate's own refusal is a styled page "Kein Zugriff auf …".
  - A bare "403 Forbidden" therefore comes from somewhere else (Cloudflare, or Google's
    consent screen).
- **Changes not visible to the owner:** usually a cached PWA version. Tell them to reload or
  reopen the app.

## Working in this repository (cloud sessions)

- **Local stack.**
  - Start it with `scripts/cloud-stack.sh`, then `pnpm exec supabase db reset --local`.
  - The container restarts now and then. Run both again when `docker ps` fails.
  - Integration tests: `scripts/with-local-supabase.sh pnpm --filter <pkg> exec vitest run <file>`.
  - e2e: `pnpm e2e <spec>`.
  - For screenshots: write a temporary spec under `e2e/` that saves into the scratchpad, run
    it, and delete it.
- **Stale dev servers.**
  - Find them with `ps -eo pid,args | grep -E "[w]rangler|[b]in.ts dev|[v]ite"` and kill them
    by PID.
  - `pkill -f` with a pattern can kill your own shell.
- **Reviews.** The `reviewer` subagent found real bugs in every larger change. Examples:
  - env-file expansion;
  - symlinks in exports;
  - unscanned binaries;
  - inconsistent monthly-fee totals.
- **Secret scan.**
  - gitleaks runs over every commit of a PR.
  - Fake keys in tests must be built at runtime, e.g. `['eyJ…', '…'].join('.')`.
  - Findings already pushed go into `.gitleaksignore` by fingerprint.
- **Git.**
  - Never force-push or rewrite history.
  - Never merge without the owner's explicit "mergen".
  - After a merge, restart the branch from `origin/main`.
- **Network.**
  - `*.mininode.app` and the production Supabase cannot be reached from the container
    (proxy 403), and the Supabase MCP server does not connect.
  - To check a deploy, use the GitHub Actions job logs.
  - The Cloudflare MCP tools can read Workers.
  - Docker Hub (`registry-1.docker.io`, `hub.docker.com`) works, e.g. for pinning image
    digests.
- **Owner preferences.**
  - Reply in German, unless they write English.
  - Be direct and concise.
  - Confirm before destructive steps.
  - Finish every open task before reporting back.
  - Document in the repo (PLAN.md, ADRs, runbooks, this file), not in the Obsidian KB.
