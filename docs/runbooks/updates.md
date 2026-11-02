# Updates

Bring a newer MiniNode, or the newest version of an app that has its own GitHub repository, into
this installation with one click (ADR 0028). Cloud edition; the desktop edition updates with
`mininode-desktop update <folder>`.

## One-time setup

1. `LIBRARY_DISPATCH_TOKEN` is set (`app-library.md`, step 1): it starts the workflows.
2. `updates.source` is in `mininode.config.json` (`owner/repo` of the project that publishes
   releases). The starter package has it; run `pnpm mininode configure` after changing it.
3. Optional: repository variable `INTEGRATE_AUTOMERGE=true`, so the pull request merges itself
   when the checks are green.
4. Optional: secret `INTEGRATE_TOKEN` (fine-grained, this repository: Contents, Pull requests,
   **Workflows**: read and write). Without it the files in `.github/workflows` are not updated
   (the pull request says so).
5. Private app repositories: `EXPORT_REPO_TOKEN` or `INTEGRATE_TOKEN` must be able to read them.

## Update MiniNode

1. Make a backup first if the data matters (Verwaltung → Sicherung, `backups.md`).
2. Verwaltung → Updates → *MiniNode aktualisieren*. After about a minute GitHub has a pull request
   `chore(platform): update to vX`.
3. Read its description (counts of new, changed and removed files). When the checks are green,
   merge. The deploy applies the new database migrations and rolls out the Workers.

By hand: GitHub → Actions → *Plattform aktualisieren* → *Run workflow* (a version tag or empty for
the newest).

## Update an app

1. In `hosted/<slug>/mininode.json` set `"repository": "owner/repo"` (once).
2. Verwaltung → Updates → *Aktualisieren* next to the app, or Actions → *App aktualisieren*.
3. Merge the pull request `chore(<slug>): update to <commit>` when the checks are green.

## When it stops

| Message | Meaning |
| --- | --- |
| `CONFLICT (applied migration changed)` | The new version edits a migration that already ran. Nothing was changed. Ask the project to add a new migration instead, or update by hand. |
| `updates.source is missing` | Set it in `mininode.config.json`. |
| `has no "repository"` | Add the field to the app's `mininode.json`. |
| `the repository holds the app "x", not "y"` | The repository is another app. |
| A pull request is already open | Merge or close it first. |
| The pull request has red checks | Nothing is deployed. Fix or close the pull request; the installation is unchanged. |

## Roll back

Revert the merge commit on `main` (GitHub → the merged pull request → *Revert*). The deploy returns
the code to the earlier version. Migrations that already ran stay applied, which is why new
migrations are written to be backward compatible (expand and contract, `CLAUDE.md`).

Locally: `pnpm mininode update platform --from <unpacked starter> --source owner/repo --dry-run`
shows what would change without writing anything.
