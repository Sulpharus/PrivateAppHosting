# Add an app

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

Remove an app: delete `hosted/<slug>/`, merge, then *Admin → Apps → Deaktivieren*. The data
schema `app_<slug>` stays until you drop it manually (`drop schema app_<slug> cascade;`) after a
backup.
