# ADR 0028: One-click updates for the platform and for apps with a GitHub repository

- Status: accepted
- Date: 2026-11-02

## Context

An installation is a copy of the starter package in the owner's own repository. A newer MiniNode
could only be brought in by hand, and an app exported to GitHub (ADR 0012) could not be brought
back after a change there. Both must be easy, must not lose data and must not break a running
installation.

## Decision

**A click starts a workflow; the workflow opens a pull request; merging deploys.** Verwaltung →
Updates calls `POST /admin/updates/platform` or `/admin/updates/apps/:slug` (admin, recent
sign-in, audit row first). The API starts `update-platform.yml` or `update-app.yml` with the
dispatch token, like the App-Bibliothek. Nothing reaches `main` without the normal checks, and
nothing is deployed before the merge, so a red check leaves the installation as it is. With
`INTEGRATE_AUTOMERGE=true` the pull request merges itself once the checks pass.

**Platform.** The new version is the starter package of the newest release of `updates.source`
(`mininode.config.json`, also `UPDATES_SOURCE` in the API Worker). `mininode update platform`
overlays its files. It never touches `hosted/`, `mininode.config.json`, `docs/STATUS.md` or
`biome.json` (one exemption per integrated app), and removes only files that a previous update or
the starter listed in `.mininode/platform-files.json`. The workflow then regenerates the lockfile
and runs `mininode configure`, so the neutral placeholders of the package become this installation's
settings again. Workflow files are updated only when `INTEGRATE_TOKEN` can push them.

**Apps.** A hosted app with `"repository": "owner/repo"` in its `mininode.json` can be updated:
`mininode update app` makes `hosted/<slug>` equal to the repository (the slug must match) and
records the commit in `.mininode-source.json`.

**Data safety.** Data is in Supabase, not in the files. History is append-only: a migration under
`supabase/migrations/` or an app's `db/` that is already applied and would change is a conflict
that stops the update before anything is written, and a migration is never deleted. New migrations
run through the existing deploy, which has its own checksum guard.

## Consequences

An update is as safe as the checks of the pull request: the pgTAP and integration jobs run on the
new migrations before anything is merged. A backup before merging is recommended in the page and the
runbook, not forced. Local edits of platform files are overwritten, visibly, in the pull request
diff. The desktop edition updates with `mininode-desktop update <folder>` (ADR 0026); one-click
updates there are not part of this decision.
