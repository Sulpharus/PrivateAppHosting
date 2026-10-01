# ADR 0013: Uploads in Verwaltung, script-first integration

- Status: accepted
- Date: 2026-10-01

## Context

New apps came in through a Claude Code session: ZIP into `inbox/`, `/integrate-app`, PR. Most
exports (AI Studio, Claude artifacts, plain HTML) need the same mechanical changes, and the owner
wants to add an app, or a program for the PC/server, from the browser without opening a session.
An AI should only spend effort where a script gets stuck.

## Decision

**One upload box, two kinds.** Verwaltung → Hochladen takes a file and decides by its name
(`uploadKind`): `.zip` is a web app, `.exe`/`.msi` a program. The API (`POST /admin/submissions`,
admin with a sign-in within ten minutes) streams the body and records an upload in
`platform.submissions` (admin read via RLS, writes by the service role only). Statuses: `queued`,
`integrating`/`installing`, `integrated`/`installed`, `needs_review`, `failed`, `dismissed`.

**Web apps: script first** (`mininode integrate`, `packages/cli/src/integrate/`).
- The ZIP is unpacked after its listing is checked (no links, no paths outside, size caps).
- The project is classified. Known shapes are rewritten:
  - Vite/React apps and AI Studio exports: dev server, provider packages and keys are removed, a
    start file (`mininode-boot.ts`) logs in first, `vite.config.ts` and `package.json` are
    rewritten, external stylesheets are dropped (CSP), a manifest is written (private data, no
    automatic access, AI budget when the app uses AI).
  - Plain HTML: inline scripts move to files, the page's scripts start after login.
  - An export that already has a `mininode.json` is taken as it is.
- Two compatibility layers in `@mininode/sdk` carry apps without rewriting them:
  `installMiniNodeCompat` (`window.MiniNode` auth, `db` → `mn.kv`, `ai` → `mn.ai`) and
  `installLocalStorageSync` (synchronous `localStorage`, loaded from and written back to `mn.kv`,
  wiped when another account used the browser).
- The result must pass `mininode doctor` and (in the workflow) build. Anything the script cannot
  judge becomes `needs_review` with coded reasons instead of a guess: own backend routes, client
  AI SDKs and keys, IndexedDB, foreign backends, WebSockets, CDN scripts, import maps, inline
  handlers, unknown Vite plugins, Next.js, Python, Docker, installers inside a ZIP, an address
  that is already taken.
- Known limit: scans and photos cannot be analysed (the AI proxy forwards text only). The compat
  layer refuses such a call with a clear error instead of answering without the image, and the
  report says so.

**The workflow** `integrate.yml` (started by the API with `LIBRARY_DISPATCH_TOKEN`, like the
library) has three jobs, so that the export's own build code never runs next to a secret:
`fetch` (service key) downloads the ZIP from the private `submissions` bucket; `build` (no
secrets, read-only token) runs the script with `--build --tidy` (formatting; findings of imported
code exempt the app from the linter in `biome.json`) and hands over the result as an artifact;
`publish` (secrets) only copies the result of a validated slug into the repository, then
- success: branch `auto/<slug>-<id>` and a pull request, or a push to `main` when the repository
  variable `INTEGRATE_AUTOMERGE` is `true` (the deploy then starts);
- needs review: branch `review/<id>` with the ZIP and the report, and an issue labelled
  `ai-review` carrying a marker `mininode-submission id=… env=…`;
- crash: status `failed` with the run link.
Pushes with the default token start no other workflow; the secret `INTEGRATE_TOKEN` (contents and
pull requests: write) makes CI and the deploy run on what the workflow creates.

**The AI review queue is GitHub.** A Claude Code session lists the `ai-review` issues, takes the
ZIP from the review branch and works the reasons (`integrate-app` skill). Closing the issue
(workflow `review-closed.yml`) sets the upload to `integrated` or, closed as not planned, to
`dismissed`, and deletes the review branch. Cloud sessions cannot reach the production database,
so nothing in the queue depends on it.

**Programs.** The installer streams to R2 (`installers/<slug>/<file>`) through R2's S3 API
(credentials as Worker secrets, so a missing bucket can never break the API's deploy), its
SHA-256 is computed while streaming, and the program is registered as a `remote` app without any
grant. nucbox-control then installs it as before (snapshot, hash check, silent install). The
program path after installation is a guess (`C:\Program Files\<Name>\<Name>.exe`): if it does not
exist, the install script looks for executables the installer just created and reports the
result (`MININODE_PROGRAM=`); the API stores it. A failed install becomes `needs_review` with the
output; the admin can change the path or the silent arguments and retry, or copy a prepared
request for an AI session ("Prüfauftrag kopieren").

## Consequences

- Uploads are limited to 40 MB (ZIP, Supabase storage) and 95 MB (installer, request body of a
  Worker); larger installers go to R2 by hand (`docs/runbooks/programs.md`).
- The build of an uploaded export runs with install scripts disabled (`--ignore-scripts`), in a job
  without secrets. The uploaded app itself reaches `main` only through a pull request, or on the
  owner's explicit `INTEGRATE_AUTOMERGE`. The upload is an admin action; an uploaded app is never
  given to users automatically.
- The script is conservative: a Vite app with an unknown plugin or a backend goes to review even if
  it might have worked. Widening it is one case at a time, with a test.
