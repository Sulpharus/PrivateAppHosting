---
name: integrate-app
description: Integrate an app export (ZIP or folder in inbox/, e.g. a Claude artifact, Google AI Studio export, Vite/Next.js project, static site, server app or native installer) into MiniNode as hosted/<slug> with login, SDK, data, AI proxy and manifest, verified by `mininode doctor` and a local run. Use when the user says "integrate", "add this app", drops a ZIP into inbox/, or invokes /integrate-app.
---

# Integrate an app into MiniNode

Goal: turn the export into `hosted/<slug>/` that passes `pnpm mininode doctor hosted/<slug>`
with **zero errors**, works locally behind the gate, and is committed on a branch with a PR.

Never use production credentials. Work only against the local Supabase stack.

## 0. Script first, then the work queue

`pnpm mininode integrate <zip|folder> [--build] [--tidy]` rewrites the shapes it knows (Vite and AI
Studio apps, including `window.MiniNode` and `localStorage` through the SDK compat layer, plain
HTML, exports that already have a `mininode.json`) and runs doctor. Exit code 0 means
`hosted/<slug>` is done: read `hosted/<slug>/README.md`, run step 4 (verify) and open the PR.
Exit code 2 means `needs_review`: its report lists exactly what stopped it (`reasons` with codes
such as `own_backend`, `indexeddb`, `cdn_scripts`); continue with step 1 and fix those points,
leave the rest as the script made it. Never integrate by hand what the script can do.

**The review queue.** Uploads from Verwaltung → Hochladen that the script could not finish become
GitHub issues labelled `ai-review` (body: report, branch `review/<id>` holds the ZIP under
`review-inbox/<id>/`). When the user says "arbeite die ai-review-Issues ab":

1. List the open issues with the label (GitHub MCP), read each report.
2. `git fetch origin review/<id>`, take the ZIP from `review-inbox/<id>/`, and work it as below
   (`inbox/` is the usual unpack place; do not commit the ZIP into `main`).
3. Open the PR with `Closes #<issue>`. Closing the issue marks the upload as built in Verwaltung
   (workflow `review-closed.yml`) and deletes the review branch. An issue the user decides against
   is closed as "not planned".

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

**Language packages.** Move the app's texts into `i18n/de.json` and `i18n/en.json` (Vite apps:
`public/i18n/`), add the `"i18n"` block to the manifest and use `data-i18n` / `mnI18n.t()` as in
`docs/ai/LANGUAGE-PACKAGES.md` (follow its style rules; both languages, professional, same keys and
placeholders). The script cannot translate: an app it finished without packages still passes
doctor with the `i18n-missing` warning, so add them before the PR unless the user said to skip.

**Mistakes exports repeat — look for these first, the script and doctor name most of them:**

- *Placeholder name:* `slug: "neue-app"`, name "Neue App" (the brief gave none). Pick a real name and
  slug and use it in `mininode.json`, `<title>`, the header and the README.
- *Keys that are not in the manifest* (`accent`, `theme`, …): doctor stops on them. The accent is
  `data-accent` in the HTML. (`mininode integrate` drops them from exports that bring a manifest.)
- *A stand-in for the platform client:* a `FallbackMiniNodeClient`, `LocalMiniNodeShim` or a bridge
  that talks to a `window.MiniNode` the platform does not have. Where it takes over, everything
  stays in one browser. Replace the file by the real SDK (`import { mininode } from '@mininode/sdk'`
  in Vite apps; `<script src="/_mininode/sdk.js">` in plain HTML) and keep the app's own API on top
  (`src/mininode.ts` of `hosted/haushalts-inventar` and `hosted/bill-the-splitter` are examples).
  Data that sits only in `localStorage` moves to `mn.kv`; for `group` data use `'shared'` scope and
  one record per entry, so two people never overwrite each other's list.
- *Fonts and icons from Google* (`fonts.googleapis.com`, Material Symbols as ligature text): the
  CSP blocks them, the icon names show as text and the layout collapses. Fonts come from
  `@fontsource-variable/<font>`; icons from `python3 scripts/subset-icons.py hosted/<slug>` (a 150 kB
  subset instead of the 4 MB font) linked in `index.html` as `/fonts/material-symbols.css`.
- *Images from other sites* (AI Studio's `lh3.googleusercontent.com/aida-public/…`, Unsplash): they
  expire or are blocked; remove them or draw a placeholder (initial letter, plain panel).
- *Tailwind plus the App Kit:* `class="mn-app"` on `<body>` makes the kit restyle inputs and buttons
  and overrides utility classes. An app with its own Tailwind design leaves `mn-app` out.
- *Sample people with real-looking addresses* (`@beispiel.de`): the export of the app stops; use
  `@example.com` (the script rewrites them).
- *The generator's `package.json`/`vite.config.ts`* (name `react-example`, `express`, dev-server
  settings): the script rewrites them for Vite apps; check it when you convert by hand.

## 4. Verify (all must pass)

```bash
pnpm install
pnpm mininode doctor hosted/<slug>                 # 0 errors; fix warnings when sensible (also i18n-*)
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
