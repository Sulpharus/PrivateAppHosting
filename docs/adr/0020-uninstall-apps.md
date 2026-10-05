# ADR 0020: Uninstalling apps from Verwaltung

- Status: accepted
- Date: 2026-10-05

## Context

Apps could be added (deploy, upload, App-Bibliothek) but not removed: only link tiles had
"Entfernen", `mininode prune` deleted the Worker of an app that was gone from the repository and
kept everything else (the code comment said "the admin deletes the data in the Host Manager", which
did not exist). The owner wants to delete an installed app completely.

## Decision

- **Verwaltung → Apps → Löschen** (every app except link tiles). A dialog explains what happens,
  offers "Auch alle Daten löschen" (on by default) and wants the app's address typed again.
- **The API** (`POST /admin/apps/:slug/uninstall`, admin, recent sign-in, audit-logged) checks the
  typed address, refuses link tiles and platform names, starts `uninstall-app.yml` (and, for a
  program of the App-Bibliothek, `library.yml remove` to stop its container) and takes the app
  offline at once.
- **The workflow** runs `mininode uninstall <slug> [--purge]` with the Cloudflare and Supabase keys
  in that one step, then opens a pull request that removes `hosted/<slug>` (and the app's Biome
  exemptions). Without the code removal the next full deploy would bring the app back; the pull
  request is auto-merged only with `INTEGRATE_AUTOMERGE=true`, like uploads.
- **`mininode uninstall`** is repeatable step by step: disable the registry row; delete the Worker
  (404 is fine); with `--purge`: hide the app schema from the Data API (a missing schema would make
  PostgREST fail for every request), drop `app_<slug>`, delete the files below `app-files/<slug>/`
  and the logo, and delete the registry row last, which takes grants, kv data, push subscriptions,
  game results and the like with it through their cascading foreign keys. A run that stopped halfway
  is started again.
- **Without purge** the data stays and the app is only offline; deploying it again brings it back.
- **Not done by a workflow**, and said so in the dialog result: the data folder of a library
  program on the NucBox, and a program that was installed in the Windows VM.

## Consequences

- One typed confirmation, one workflow, no direct deletion in the browser; the destructive part has
  a log (Actions) and an audit row.
- The removal pull request can fail CI when something else in the repository refers to the app
  (an e2e test, a document): that is for the owner to see and fix in that pull request.
- Tested against the local stack (`pnpm test:roundtrip`: purge, neighbour untouched, Data API still
  answers, repeatable); the Cloudflare and Management API calls are the same ones deploy and prune
  already use.
