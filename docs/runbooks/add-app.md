# Add an app

The quick way: Verwaltung → Apps → Hochladen (`uploads.md`). A script integrates what it knows and
hands the rest to the steps below. The steps below are the manual way and the AI review.

1. Drop the ZIP (Claude artifact, AI Studio export, Vite/Next.js project, server app, installer
   notes) into `inbox/`.
2. In Claude Code in this repo: `/integrate-app` (or "integrate the app in inbox"). The skill
   picks the playbook from `docs/ai/playbooks/`, writes `hosted/<slug>/` with `mininode.json`,
   wires the SDK (login, data, AI proxy), runs `pnpm mininode doctor hosted/<slug>` and a local
   run. The ZIP stays in `inbox/` (git-ignored) for reference; delete it when done.
3. Review the diff (manifest: `slug`, `access`, `data.mode`, `ai.models` and budget).
4. Push to a branch and open a PR: CI runs doctor, tests and a dry-run deploy.
5. Merge: the deploy workflow migrates the app schema, deploys it (`<slug>.mininode.app`) and
   registers it in the portal.
6. *Admin → Apps* shows it online after the deploy; grant users under *Admin → Nutzer & Rollen* (apps
   with `access.default` are granted to everyone automatically).
7. Remote apps only: upload the installer to R2 (`installers/<slug>/<file>`), then *Admin →
   Remote-Apps → Installieren*.

Remove an app: Verwaltung → Apps → *Löschen* (`uninstall.md`). It takes the app offline, deletes its
Worker and (optionally) all its data, and opens a pull request that removes `hosted/<slug>/`. *Deaktivieren*
only switches it off.
