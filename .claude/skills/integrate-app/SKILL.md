---
name: integrate-app
description: Integrate an app export (ZIP or folder in inbox/, e.g. a Claude artifact, Google AI Studio export, Vite/Next.js project, static site, server app or native installer) into MiniNode as hosted/<slug> with login, SDK, data, AI proxy and manifest, verified by `mininode doctor` and a local run. Use when the user says "integrate", "add this app", drops a ZIP into inbox/, or invokes /integrate-app.
---

# Integrate an app into MiniNode

Goal: turn the export into `hosted/<slug>/` that passes `pnpm mininode doctor hosted/<slug>`
with **zero errors**, works locally behind the gate, and is committed on a branch with a PR.

Never use production credentials. Work only against the local Supabase stack.

## 1. Prepare

1. Read `docs/ai/NEW-APP-SPEC.md` (the contract) and `docs/ai/playbooks/README.md`.
2. Unpack: `mkdir -p /tmp/integrate && unzip -o "<zip>" -d /tmp/integrate/<name>`
   (or copy the folder). Never unpack into `hosted/` directly.
3. Inventory: list files, read `package.json`, `index.html`, entry points and anything that
   touches storage, auth, network or AI (`grep -rnE "localStorage|indexedDB|window\.(claude|storage)|process\.env|import\.meta\.env|genai|anthropic|openai|fetch\(|firebase|supabase" `).

## 2. Classify and plan

Pick the playbook with the signal table in `docs/ai/playbooks/README.md`. Decide and write
down (in the PR description later):

- slug (short, German or neutral, lowercase; check `hosted/` and `packages/manifest` reserved list)
- kind/target, data mode (see common steps), AI models and budget
- what the app stores and how it maps to `mn.kv` or tables
- anything that cannot be supported (tell the user instead of silently dropping it)

If the data mode or a feature cut is a real product decision, ask the user one short question;
otherwise decide and state the assumption.

## 3. Convert

Follow the chosen playbook, then `docs/ai/playbooks/common-steps.md`. Compare with the matching
fixture in `fixtures/<source>/expected/` for the target shape. Keep the app's look and features;
change only what the platform requires. Load the `supabase-postgres-best-practices` skill before
writing `db/*.sql`.

## 4. Verify (all must pass)

```bash
pnpm install
pnpm mininode doctor hosted/<slug>                 # 0 errors; fix warnings when sensible
pnpm lint                                         # hosted/ uses a relaxed profile
pnpm db:start                                     # if not running
scripts/with-local-supabase.sh pnpm mininode dev hosted/<slug>
```

Then, with the Playwright MCP (or `pnpm exec playwright`), sign in at `http://localhost:5173`
with a local test user (create one with the Supabase admin API via the secret key from
`pnpm exec supabase status`), open `http://localhost:8790` and exercise each feature: create
data, reload, check it persisted; for `shared-account`/`group` also check with a second user.
AI features: the local AI proxy is usually not running — verify the call is made through
`mn.ai` and handles errors gracefully.

## 5. Deliver

1. `hosted/<slug>/README.md` states origin, what changed, open points.
2. Branch `feat/<slug>` (or the session branch), commit `feat(<slug>): integrate <source> export`.
3. Push and open a PR: summary, playbook used, data mode and why, removed/unsupported features,
   manual steps for the admin (e.g. installer upload, secrets).
4. Remove the unpacked temp folder. Leave the ZIP in `inbox/` (git-ignored) for reference.

## Never

- commit files from `inbox/`, `.env*`, keys, or build output (`dist/`)
- write `create policy`, `grant … to anon`, or tables outside `app_<slug>`
- keep provider SDKs, CDN scripts, `localStorage` for user data, or `window.claude`
- mark the work done while `mininode doctor` reports errors
