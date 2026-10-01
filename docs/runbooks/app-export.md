# Apps as GitHub projects

Export one app as its own GitHub repository, without user data or keys (ADR 0012).

## One-time setup

1. `LIBRARY_DISPATCH_TOKEN` must be set (`app-library.md`, step 1). The same token starts the
   export.
2. Export token:
   - GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*.
   - Resource owner: you. Repository access: *All repositories*, because the token has to
     create new ones.
   - Permissions: *Administration: Read and write*, *Contents: Read and write*.
   - Save it as `EXPORT_REPO_TOKEN` in the GitHub environment `production`. It is used only by
     the export workflow, never by a Worker.

## Export

1. Verwaltung → Apps → *Als GitHub-Projekt* next to the app.
2. Choose the name (default `mininode-<slug>`) and the visibility (private by default).
3. After about a minute the repository exists under your account. Progress: GitHub → Actions →
   *App als GitHub-Projekt*.

Exporting the same app again adds a commit to that repository. A license is not added; choose
one on GitHub before you share the project.

Locally, without GitHub: `pnpm mininode export hosted/<slug> --out ../export-<slug>`.

## When the export stops

The log lists each finding as `file:line rule`:

| Finding | What to do |
| --- | --- |
| identifier of this instance | Code mentions the Supabase project, the Cloudflare account or a commit author's address. Read it from the SDK or configuration instead, then merge. |
| email address … | Replace it with an `example.com` address or remove it. |
| a key (GitHub token, private key, …) | It must not be in the repository at all. Remove it, **rotate the key** (`key-rotation.md`), merge, export again. |
| gitleaks finding | As above. gitleaks redacts the value in the log. |
| "exists and is not a MiniNode export" | A repository of that name already exists on your account. Pick another name. |
