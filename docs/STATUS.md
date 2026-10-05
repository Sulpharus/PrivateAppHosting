# Status and handoff

Where things stand, what the owner still has to do, and what a new session should know.
Update it at the end of every working session; history belongs in git, not here.

Last updated: 2026-10-02 (third session; language switch added).

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
6. Keep the wiki current: every change a person can see or operate updates `docs/wiki/` in the
   same commit (`CLAUDE.md`, "Knowledge (wiki)").

Where things are documented:

| Topic | Read |
| --- | --- |
| Architecture, phases, data model | `PLAN.md` |
| Decisions | `docs/adr/0001`–`0018` |
| Operations: setup, NucBox, keys, Kalender, App-Bibliothek, app export, restore | `docs/runbooks/` (index in its README) |
| Building apps with AI: spec, design system, prompt modules, playbooks | `docs/ai/` |
| Shared data types (suite) | `docs/suite/data-types.md` |
| Concepts, how-tos, first steps (German, for the owner) | `docs/wiki/`, shown in Verwaltung → Wissen |
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
| More games | Minensucher (3 levels), Sudoku (own generator, 5 levels rated by technique), Solitär (Klondike), 2048, Codeknacker (Mastermind); shared `window.mnGame` helper | `hosted/{minensucher,sudoku,solitaer,n2048,codeknacker}`, `packages/ui/kit/game.js`, `e2e/games-more.spec.ts` |
| Uploads | Verwaltung → Hochladen: ZIP = web app (script `mininode integrate`, then PR; what it cannot do becomes a GitHub issue `ai-review`), `.exe`/`.msi` = program for the PC/server | ADR 0013, `docs/runbooks/uploads.md`, `programs.md` |
| Compat layers | `window.MiniNode` and `localStorage` apps run through `@mininode/sdk` (`installMiniNodeCompat`, `installLocalStorageSync`) | `packages/sdk/src/compat.ts` |
| Own drawers and order | Schubladen and "Eigene Reihenfolge" per screen, on the start page and in the Gaming Hub | ADR 0015 |
| Personal API keys | Admin switches an API to "persönlich"; the SDK popup leads to `/account/keys` | ADR 0014 |
| Release editions | `v*` tags build cloud, PC/server and complete packages; `cloud-v*`, `pc-server-v*` one edition | ADR 0016, `docs/runbooks/releases.md` |
| Sportplaner course price | Whole course or monthly fee, split over the sessions that take place, booked per session in Statistik | `hosted/sportplaner/js/price.js`, README |
| Medialog | "Sammlung" tab no longer shows the suggestion chips ("Vorschläge") under the search | `hosted/medialog/src/views/SammlungView.tsx` |
| Gemeinsame Daten | One aligned table (Datentyp, App, Grund, Angefragt, Freigabe); sort by open requests first, type or app; filter "Nur noch offene"; write priority below | `apps/portal/src/admin/Suite.tsx` |
| Verwaltung menu | "Hochladen" is a button in Apps; Apps has a switch Apps / Gaming Hub and sorts by name, category, own drawer or status; "Hardware-Server" holds Auslastung (was NucBox), Remote-Apps and App-Bibliothek (old URLs redirect) | `apps/portal/src/admin/{Apps,Hardware,AdminLayout}.tsx` |
| KI-Werkstatt | Features in 7 collapsible groups with search; 19 new feature modules (money, dates, editor, drag sort, AI chat/vision, roles, comments, accessibility, errors, testing, migration, game save/touch/generator/kit, container, remote program, library entry) and 2 new types (Server-Dienst, Programm) | `docs/ai/prompts/`, `apps/portal/src/admin/{Workshop,prompts}.ts(x)` |
| Language switch | Per person in Konto → "Sprache / Language" (de/en, profile + `mn-lang` cookie); every hosted app has `i18n/de.json` + `en.json`; new apps must ship both; doctor checks them; the KI-Werkstatt has a ready prompt to retrofit them (`docs/ai/RETROFIT-LANGUAGE.md`) | ADR 0017, `docs/ai/LANGUAGE-PACKAGES.md`, `packages/ui/kit/i18n.js`, `e2e/language.spec.ts` |
| App logos | Verwaltung → Apps uploads a logo per app (bucket `app-icons`); deploy picks up `icon.svg`; prompt module "App-Logo"; tile buttons in their own row | ADR 0018, `apps/portal/src/lib/appIcon.ts`, `packages/cli/src/deploy/icon.ts`, `e2e/app-icons.spec.ts` |
| Haushaltsinventar | Upload review `ee7721bb` (AI Studio "Steward") rebuilt on the platform: items with photo, receipt, warranty, owner, households, service dates and reminders (`mn.push`), backups that restore, Excel report; data mode `shared-account`, rose accent | `hosted/haushalts-inventar`, `e2e/haushalts-inventar.spec.ts` |
| Wissen | Verwaltung → Wissen: Wiki (34 German articles, search, generated reference pages for apps, workflows, commands, ADRs, runbooks) and a Startup-Guide checklist; the rule and a CI test keep it current | ADR 0021, `docs/wiki/`, `apps/portal/src/admin/{Wiki,Guide}.tsx`, `apps/portal/src/lib/wiki*.ts`, `e2e/wiki.spec.ts` |
| Backups | Verwaltung → Sicherung: one password-protected archive (accounts with passwords, platform and app data, files, settings) made by `backup.yml`, downloaded from the page; `mininode backup create|verify|restore`; restore tested by a round trip on the local stack | ADR 0019, `docs/runbooks/backups.md`, `packages/cli/src/backup`, `apps/api/src/routes/backups.ts`, `e2e/backups.spec.ts` |
| Uninstall | Verwaltung → Apps → Löschen: typed address, optional deletion of all data; `uninstall-app.yml` deletes the Worker (and schema, files, registry entry) and opens a pull request that removes `hosted/<slug>`; `mininode uninstall` | ADR 0020, `docs/runbooks/uninstall.md`, `packages/cli/src/deploy/uninstall.ts`, `e2e/uninstall.spec.ts` |
| German formats | Date, month and time inputs as German parts in every browser; full dates as "01. Okt. 2026"; German numbers | `packages/ui/kit/ui.js`, `docs/ai/DESIGN-SYSTEM.md` §8 |

The Sportplaner map (tab "Karte") and course mode (editor step "Zeiten" → "Kurs") are live
since the PR #12 deploy. Earlier deploys stopped at medialog and never shipped them.

## Conventions worth knowing

- **Every visible text is a language key.** Apps read their texts with `window.mnI18n.t(key)` or
  `data-i18n` markup and ship `i18n/de.json` and `i18n/en.json` (Medialog: `public/i18n/`). The
  person picks the language in Konto; `mininode doctor` checks that both packages agree. German
  stays the default and the fallback. Details: ADR 0017, `docs/ai/LANGUAGE-PACKAGES.md`.
- **German formats in German, British formats in English.** The owner wants this strictly:
  numbers, dates and sorting follow `mnI18n.locale` (`de-DE`, `en-GB`).
  The German rules:
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
  - Opt out per field or area with `data-mn-native`. Invalid fields get a German message under
    the parts (role=alert) instead of the browser bubble.
- **Apps that load the kit:** haushalt, kalender, wunschliste, memory, medialog and haushalts-inventar load
  `ui.css` and `ui.js`; the games also load `game.js`. The Sportplaner has its own styles and loads only `ui.js`.
- **Plain-script apps** (sportplaner, haushalt) share one global scope per page. Testable pure
  logic goes into its own file:
  - Sportplaner: `js/price.js`, tested by reading and evaluating the file in Vitest.
  - Haushalt: ES modules.

## Waiting on the owner

0. **Check in Verwaltung → Hochladen and Apps (nothing the code can do for you):** the page still
   says "Der automatische Einbau ist noch nicht eingerichtet" until `LIBRARY_DISPATCH_TOKEN`
   (fine-grained token, Actions: read and write, secret of the GitHub environment `production`)
   exists and a deploy ran; add `INTEGRATE_TOKEN` too. Google sign-in needs one Google OAuth client
   entered under Supabase → Auth → Google (`first-setup.md` §3.1). New migrations
   (`…_profile_language`, `…_app_icons`) are applied by the deploy.
0. **For the new upload features** (all optional until used, each page says what is missing):
   - **A ruleset on `main` that requires the CI checks** (Settings → Rules → Rulesets: *Lint,
     typecheck, test*, *Database, integration and e2e*, *Infra scripts and images*, *Secret
     scan*). Without it GitHub lets you merge a red pull request, as happened with the first two
     uploads (`runbooks/uploads.md` step 4);
   - `INTEGRATE_TOKEN` (GitHub secret: contents + pull requests write) so CI and deploy run on
     what the integrate workflow creates; `INTEGRATE_AUTOMERGE=true` (variable) only after the
     ruleset exists (it then merges when the checks are green);
   - `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` as secrets of the API Worker for
     program uploads;
   - the migration `20261001150000_…` (the deploy applies it) and a release tag when you want the
     packages (`git tag v0.1.0 && git push origin v0.1.0`).
0. **Backups** (`runbooks/backups.md`): add the secret `BACKUP_PASSPHRASE` (16+ characters, also in your
   password manager) to the GitHub environment `production`, then Verwaltung → Sicherung works.
   Do one restore drill into a staging project; restoring into the hosted project is verified on the
   local stack only.
1. Approve the suite requests under Verwaltung → Gemeinsame Daten:
   - Kalender: event delete, the other types read;
   - Sportplaner: activity write;
   - Haushalt: contract write.
2. Connect Google with calendar access under "Dein Konto" (Google Calendar sync).
3. NucBox setup (`nucbox-install.md`): `vars.NUCBOX_TUNNEL_ID`, deploy SSH key, Access
   secrets. Container apps and the App-Bibliothek need it.
4. GitHub tokens:
   - `LIBRARY_DISPATCH_TOKEN`: Actions write, this repository. Starts the library and export
     workflows.
   - `CATALOG_TOKEN`: Contents read, this repository. Goes into `/etc/mininode/deploy.env` on
     the NucBox.
   - `EXPORT_REPO_TOKEN`: Administration + Contents write, all repositories.
   - See `app-library.md` and `app-export.md`.
5. Pick a license before sharing an exported app.

## Open and proposed work

- **Sharing the whole platform** (PLAN §15.2): proposed, the owner has not decided yet.
  - Next steps would be to move instance settings into one `mininode.config.json`, then
    generate a clean public template repository.
- **"Aether Notes":** the owner will upload it through Verwaltung → Hochladen once the upload
  features are live (it could not be sent into the chat). If the script sends it to review, the
  issue with label `ai-review` carries the report; work it with the `integrate-app` skill.
- **Sentinel** (AI Studio insurance manager, `window.MiniNode` shim) was the test case for
  `mininode integrate`: it integrates by script, builds and passes doctor. It was not committed to
  `hosted/`; upload it again from Verwaltung when wanted. Its scan/OCR feature needs image support
  in the AI proxy (not there yet, see ADR 0013). The zip held one app although two were announced.
- **Not tested on production:** the upload workflows, the R2 upload, the NucBox program install
  and the personal-key proxy path run only against unit tests and the local database. Try each once
  with a small file before relying on it. The e2e stack has no API Worker, so saving a key and
  starting an upload are not covered by Playwright.
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
  - inconsistent monthly-fee totals;
  - date fields: lost on form reset, partial edits wiped, `type="month"` read as text in
    desktop Firefox and Safari (the kit now reads the attribute and checks min/max itself).
- **Secret scan.**
  - gitleaks runs over every commit of a PR.
  - Fake keys in tests must be built at runtime, e.g. `['eyJ…', '…'].join('.')`.
  - Findings already pushed go into `.gitleaksignore` by fingerprint.
- **Git.**
  - Never force-push or rewrite history.
  - Never merge without the owner's explicit "mergen".
  - After a merge, restart the branch from `origin/main`.
- **Network.**
  - Deploys reach the production database through the Session pooler (`SUPABASE_DB_URL`,
    user `postgres.<ref>`, URL-encoded password); the direct `db.<ref>.supabase.co` host is
    IPv6 only and fails on GitHub runners.
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
