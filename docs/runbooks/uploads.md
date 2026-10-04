# Uploads: web apps and programs from Verwaltung

Verwaltung → Hochladen takes a ZIP (web app) or an `.exe`/`.msi` (program for the PC/server).
Design and limits: ADR 0013.

## What happens

- **ZIP:** the API stores it and starts the workflow *Web-App einbauen* (`integrate.yml`). The
  script `mininode integrate` rewrites the export, checks it with doctor and builds it.
  - Done: a pull request `auto/<slug>-<id>` (or a push to `main` with `INTEGRATE_AUTOMERGE`).
    Merging deploys it. The app has no access for anybody until you grant it under *Apps*.
  - Not done: an issue labelled `ai-review` and a branch `review/<id>` with the ZIP. Tell Claude
    Code: "arbeite die ai-review-Issues ab" (skill `integrate-app`). Closing the issue updates the
    upload in Verwaltung.
- **EXE/MSI:** see `programs.md`.

The list under the upload box shows every step, the reasons when something needs a review, the log
and links to the run, the pull request and the issue. "Prüfauftrag kopieren" puts a ready request
for a Claude session on the clipboard.

## Setup (once)

1. **Start key.** The workflow is started with the same token as the App-Bibliothek
   (`LIBRARY_DISPATCH_TOKEN`, Actions: write; see `app-library.md`). Without it the page says so and
   ZIPs are refused.
2. **Workflow secrets** (GitHub environment `production`, and `staging` if you use it):
   `SUPABASE_SECRET_KEY` (already there for the deploys).
3. **Let CI and the deploy run on what the workflow creates:** add the secret `INTEGRATE_TOKEN`, a
   fine-grained token for this repository with *Contents* and *Pull requests* write. Without it
   the pull request exists but shows no checks, and a push to `main` does not deploy (pushes made
   with the default token start no other workflow).
4. **Optional, fully automatic:** set the repository variable `INTEGRATE_AUTOMERGE` to `true`.
   A successful integration is then pushed to `main` and deployed without a pull request. Keep it
   off while the script is new; the pull request is your review.
5. **Label and issues:** nothing to do; the workflow creates the label `ai-review`.
6. Apply the migration `20261001150000_uploads_drawers_personal_keys.sql` (the deploy does).

## What the script handles, and what it sends to review

Handled: Vite/React and AI Studio exports (including `window.MiniNode` apps and apps that keep
data in `localStorage`), plain HTML, exports that already have a `mininode.json`.
Sent to review (reasons are coded, e.g. `own_backend`): server routes, provider SDKs or keys in
the browser, IndexedDB, Firebase/Supabase of their own, WebSockets, CDN scripts or import maps,
inline event handlers, unknown Vite plugins, Next.js, Python, Docker, an installer inside a ZIP,
an address that already exists.

Not available yet: reading scans and photos with AI (the AI proxy forwards text only). The app
shows an error for it, and the report says so.

## Try the script on your own PC

```bash
pnpm mininode integrate path/to/export.zip --build --tidy --report report.md
```

Exit code 0: `hosted/<slug>` is ready. Exit code 2: needs review (see the report). Nothing is left
behind in `hosted/` in that case.

## "GitHub hat den Start des Einbaus abgelehnt"

The message now names GitHub's status. 401: the token is invalid, expired or pasted with
quotes or spaces. 403: the fine-grained token lacks *Actions: Read and write*. 404: the token
does not cover `Sulpharus/PrivateAppHosting` (select the repository explicitly) or
`integrate.yml` is not on `main`. 422: the workflow cannot be dispatched with these inputs.
After fixing `LIBRARY_DISPATCH_TOKEN` in the GitHub environment `production`, run the Deploy
workflow on `main` once so the API Worker receives it, then retry the upload.

If the start is refused with 404 although the token is right, check that GitHub lists the
workflow: `GET /repos/Sulpharus/PrivateAppHosting/actions/workflows` must contain
`integrate.yml`. A workflow file that was merged but never registered answers 404 until a
push to `main` touches it again.
