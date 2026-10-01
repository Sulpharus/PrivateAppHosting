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
- One hosted app, exactly as it runs: the files tracked on `main` under `hosted/<slug>/`.
  - Untracked files (`node_modules`, builds, local notes) are never included.
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
    Cloudflare account id, and every commit author address;
  - any other email address except `example.*` and no-reply addresses.
- gitleaks (pinned image) then scans the exported folder as a second, independent check.

**Publishing.**
- Verwaltung → Apps → "Als GitHub-Projekt" (admin, sign-in within ten minutes):
  - asks for a repository name and visibility (private by default; public needs a confirmation);
  - starts `export-app.yml` on `main` through the API (`GITHUB_DISPATCH_TOKEN`, ADR 0011);
  - writes an audit entry.
- `scripts/publish-export.sh` creates the repository under the owner of `EXPORT_REPO_TOKEN`, a
  fine-grained token with Administration and Contents write.
  - A new repository starts with one fresh commit, so this repository's history never leaves.
  - A repeat export adds a commit to the earlier export, marked by the topic `mininode-app`.
  - It refuses any other existing repository, so no unrelated project is ever overwritten.

## Consequences

- An exported app runs only inside a MiniNode: login, SDK, kit and storage come from the
  platform. Making the platform itself shareable is a separate step (see PLAN.md §15.2).
- The checks are pattern-based. They catch keys and this installation's identifiers. They
  cannot judge whether a hard-coded text is private (a name in a sample entry, say). Exporting
  publicly stays a deliberate choice, and private is the default.
- No license is added. The owner picks one in the new repository before inviting others.
