# ADR 0029: Apps as ZIP files, apps from a GitHub link, and automatic app updates

- Status: accepted
- Date: 2026-11-24

## Context

Handing an app to someone else who runs MiniNode needed a GitHub project (ADR 0012). Bringing an
app in from GitHub needed the app's folder in this repository first, and its updates (ADR 0028)
were always one click and one review per new version. The owner wants to pass apps on as a file,
install an app straight from a GitHub link, and let chosen apps keep themselves up to date.

## Decision

**ZIP export.** Verwaltung → Apps → "Als ZIP" starts `export-app.yml` with `target: zip`. The
export is the same as for a GitHub project (`mininode export`: tracked files only, no data, keys or
instance identifiers, gitleaks as a second opinion); instead of a repository it is kept as the
workflow artifact `mininode-app-<slug>-<date>` for 7 days. The page lists the ZIP exports and hands
out a short-lived download address (`/admin/app-zips`), recorded in the audit log, like backups
(ADR 0019). The receiver installs the file under Verwaltung → Hochladen (ADR 0013).

**Install from a GitHub link.** Verwaltung → Hochladen takes a link (`POST
/admin/submissions/github`). It becomes an upload with `repository` set and no stored file; the
fetch job of `integrate.yml` clones the repository (git only, nothing of it runs there) and packs
it as the ZIP, and from there it is an upload like any other: the integration script without
secrets, a pull request, auto-merge only with `INTEGRATE_AUTOMERGE`. When the repository holds a
MiniNode app with its own `mininode.json` for the same address, the publish job writes
`repository` (and `autoUpdate` if asked for) into the manifest and records the commit in
`.mininode-source.json`, so Verwaltung → Updates knows the app. Any other repository is installed
once, without updates.

**Automatic updates.** `platform.apps.auto_update` says whether an app brings in new versions of
its repository by itself. The first registration takes it from the manifest's `autoUpdate`;
afterwards the admin switches it in Verwaltung → Updates (`PUT /admin/updates/apps/:slug/auto`,
audited). Every night `auto-update-apps.yml` runs `update-app.yml` for these apps. Its pull request
is set to merge itself once the required checks of `main` pass, but only when the app's
`mininode.json` stays the same apart from `repository` and `autoUpdate`. A new version that changes
rights, domains, keys or the data mode waits for a person, as in ADR 0028. Applied migrations are
never changed (ADR 0028), new ones run through the normal checks (RLS meta-test).

## Consequences

- Code from outside this repository can reach `main` without a person reading it, for apps the
  admin chose. The guard is the manifest (what the app may do stays as approved), the checks of
  `main`, and RLS; a malicious update could still change what the app does inside its own rights.
  The switch is off unless the admin turns it on.
- Automatic merging needs `INTEGRATE_TOKEN` (so the checks run), "Allow auto-merge" and a rule
  that requires the checks on `main`; without them the pull request stays open.
- ZIP files live 7 days at GitHub; a longer-lived copy is the admin's to keep.
