# ADR 0012: Apps as GitHub projects

- Status: accepted
- Date: 2026-10-01

## Context

Apps built on MiniNode should be shareable: as a backup outside this repository, with friends
who run their own MiniNode, or publicly. An app's code lives in `hosted/<slug>/`; its users'
data lives in Supabase. Sharing must never take along user data, keys, or identifiers of this
installation (Supabase project, Cloudflare account, the owner's address).

## Decision

**What is exported.**
- One hosted app, exactly as it runs: the files committed on `main` under `hosted/<slug>/`,
  read from git rather than from a working folder.
  - Untracked files (`node_modules`, builds, local notes) and uncommitted edits are never
    included.
  - Symlinks and submodules are refused, so nothing outside the app can be pulled in.
  - Data files (`.db`, `.sqlite`, `.csv`, `.xlsx`, archives, dumps) are refused.
  - Binary files are refused unless they are images or fonts. Those are still scanned for keys,
    and JPEGs with EXIF metadata (place, camera) are refused until it is stripped.
  - `.env*`, `.dev.vars`, keys and certificates are never included, even when tracked.
  - Data mode, shared types, API ids and Google scopes in `mininode.json` describe what the app
    needs; the keys stay with each admin (ADR 0006).
  - `db/` holds table definitions only. Rows stay in Supabase.
- Link tiles and App-Bibliothek programs are not exported; they are not our code.
- `MININODE.md` explains how to install the package in another MiniNode (`hosted/<slug>/`, or
  as a ZIP through `inbox/` and the `integrate-app` skill).

**Checks.** The export stops on any finding, and nothing is published:
- `mininode export` (`packages/cli/src/export.ts`) scans every text file for:
  - credentials (private keys, Supabase secret keys, Anthropic, OpenAI-style, Google, GitHub,
    Slack and AWS keys, JWTs, webhook secrets);
  - this installation's identifiers: Supabase project refs, publishable keys and URLs, the
    Cloudflare account id (from `deploy.yml` and the Worker configs), and every commit author's
    address and name. When the account or the projects cannot be found, the export refuses to
    run instead of checking less;
  - any other email address except `example.*` and impersonal no-reply addresses.
- gitleaks (pinned image) then scans the exported folder as a second, independent check.

**Publishing.**
- Verwaltung → Apps → "Als GitHub-Projekt" (admin, sign-in within ten minutes):
  - asks for a repository name and visibility (private by default; public needs a confirmation);
  - starts `export-app.yml` on `main` through the API (`GITHUB_DISPATCH_TOKEN`, ADR 0011);
  - writes an audit entry.
- The workflow has two jobs. The first runs the repository's code (install, export, gitleaks)
  without any token and hands over the checked folder. The second holds `EXPORT_REPO_TOKEN`, a
  fine-grained token with Administration and Contents write. It checks out only
  `scripts/publish-export.sh` and installs nothing.
- `scripts/publish-export.sh` publishes the folder under the token's owner.
  - A new repository starts with one fresh commit, so this repository's history never leaves.
  - A repeat export adds a commit, but only to the earlier export of the same app: its
    `.mininode-export` must name the same slug, and its visibility must match the one asked
    for. A private request never updates a public repository.
  - Any other existing repository is refused, so no unrelated project is ever overwritten.

## Consequences

- An exported app runs only inside a MiniNode: login, SDK, kit and storage come from the
  platform. Making the platform itself shareable is a separate step (see PLAN.md §15.2).
- The checks are pattern-based. They catch keys and this installation's identifiers. They
  cannot judge whether a hard-coded text is private (a name in a sample entry, say). Exporting
  publicly stays a deliberate choice, and private is the default.
- No license is added. The owner picks one in the new repository before inviting others.
