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
fetch job of `integrate.yml` clones the repository (git only, nothing of it runs there; no
database key in that step, only `APP_READ_TOKEN` or the workflow token; symbolic links and more
than 40 MB are refused) and packs it as the ZIP, and from there it is an upload like any other: the integration script without
secrets, a pull request, auto-merge only with `INTEGRATE_AUTOMERGE`. When the repository holds a
MiniNode app with its own `mininode.json` for the same slug (and, if it names one, the same
repository), the publish job writes `repository` (and `autoUpdate` if the admin ticked it) into the
manifest. Any `repository` or `autoUpdate` an upload brings itself is removed first: where updates
come from is never the upload's decision. The publish job and records the commit in
`.mininode-source.json`, so Verwaltung → Updates knows the app. Any other repository is installed
once, without updates.

**Automatic updates.** `platform.apps.auto_update` says whether an app brings in new versions of
its repository by itself. The first registration takes it from the manifest's `autoUpdate`;
afterwards the admin switches it in Verwaltung → Updates (`PUT /admin/updates/apps/:slug/auto`,
audited). Every night `auto-update-apps.yml` runs `update-app.yml` for these apps. Its pull request
is set to merge itself once the required checks of `main` pass, but only when **nothing of the
update runs with the deploy's keys**:

- the app's `mininode.json` stays the same apart from `repository` and `autoUpdate` (rights,
  domains, keys, data mode);
- the app has no `build` step and runs on Cloudflare (a build runs the repository's tools with the
  Cloudflare and database keys);
- no file under `db/` (migrations run as the database owner), no `package.json`, lockfile,
  `*.config.*`, `.npmrc`, `.pnpmfile*` or `build.mjs` changes;
- `main` requires status checks (otherwise `--auto` would merge at once).

Anything else waits for a person, as in ADR 0028.

## Consequences

- Code from outside this repository can reach `main` without a person reading it, for apps the
  admin chose, but only files that the deploy uploads as they are (static pages, scripts that run
  in the browser behind the gate). Nothing of such an update runs with the deploy's keys. What it
  can still do: change what the app shows and does in the browser within its approved rights (its
  data, its API keys through the proxy). The switch is off unless the admin turns it on.
- Apps with a build step (most converted exports) never update themselves; their updates wait for
  a person.
- Automatic merging needs `INTEGRATE_TOKEN` (so the checks run), "Allow auto-merge" and a rule
  that requires the checks on `main`; without them the pull request stays open.
- ZIP files live 7 days at GitHub; a longer-lived copy is the admin's to keep.
- Private repositories need `APP_READ_TOKEN` (Contents: read) in the `production` environment.
