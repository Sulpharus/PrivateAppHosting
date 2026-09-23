# MiniNode.app

A private, invite-only hosting platform. It serves web apps, services and remote native
programs under `*.mininode.app` with one Supabase login. `PLAN.md` is the source of truth for
architecture and scope, and `docs/adr/` records decisions. Read both before any structural change.

## Layout

- `apps/`: platform deployables (`portal`, `api`, `ai-proxy`, `nucbox-control`)
- `packages/`: shared libraries (`manifest`, `sdk`, `gate`, `ui`, `cli`, `config`)
- `hosted/<slug>/`: user apps, each with a `mininode.json` manifest
- `inbox/`: ZIP drop zone, git-ignored. Integrate with the `integrate-app` skill.
- `supabase/`: migrations and pgTAP tests
- `infra/`: Cloudflare and NucBox configuration
- `docs/ai/`: specs and playbooks for AI-built apps

## Commands

```bash
pnpm install
pnpm lint          # Biome (lint + format check)
pnpm format        # Biome autofix
pnpm typecheck     # tsc across the workspace (Turborepo)
pnpm test          # Vitest across the workspace
pnpm check         # all of the above
pnpm db:start      # local Supabase (Docker)
pnpm db:test       # pgTAP tests against local Supabase
pnpm mininode doctor <path|--all>  # validate hosted apps
```

Run `pnpm check` before every commit, and `pnpm db:test` when anything under `supabase/` changes.

## Knowledge graph (graphify)

`graphify-out/graph.json` maps every symbol, import, SQL object and doc heading in the repo
(code via tree-sitter, no LLM). Query it before broad Grep/Glob or reading many files:

```bash
pnpm kb                                  # install graphify if needed and refresh the graph
graphify query "how do remote sessions start" --budget 1500
graphify explain "createScheduler"       # a symbol and its neighbours, with file:line
graphify path "remote.ts" "prepareWindows"
graphify affected "decide"               # what breaks if this changes
```

`graphify-out/GRAPH_REPORT.md` lists hubs and subsystems. The graph notes the commit it was
built from; run `pnpm kb` after structural changes and commit `graphify-out/` with them.

## Rules

- TypeScript strict, ESM only, no `any`, no non-null assertions. Validate external input
  with zod at boundaries.
- **RLS is the security boundary.** Every table in an `app_*` schema has RLS enabled, and every
  policy calls `platform.has_grant('<slug>')`. The pgTAP meta-test enforces this.
- Never grant anything to `anon` in app schemas. Never put secrets in the repo, in client
  bundles or in `mininode.json`.
- All auth UI lives in `apps/portal` at `/login` (ADR 0001). Apps call `sdk.auth.requireLogin()`.
- Workers:
  - Use the generated binding types (`wrangler types`).
  - Enable observability.
  - Use `ctx.waitUntil` for background work.
  - Load the `workers-best-practices` and `wrangler` skills when working on Workers.
- Supabase: load the `supabase` and `supabase-postgres-best-practices` skills before writing
  SQL, RLS or auth code. Verify against current docs; do not rely on memory.
- Keep changes minimal and match the surrounding style. Every package has a README.
- Migrations on live data follow expand and contract: add nullable, dual-write, backfill,
  switch reads, then drop. Create indexes on large tables `concurrently`.
- Webhook and hook handlers verify signatures and are idempotent (safe to receive twice).
- Non-trivial changes get an independent review before pushing: spawn the `reviewer` subagent
  on the diff and fix what it reports.
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- A feature for a later phase ships with a CI smoke test, or sits behind a flag marked unsupported.

## UI

Tokens live in `packages/ui` (never raw colours or fonts in components). Fonts: Bricolage Grotesque (display), Instrument Sans (text),
JetBrains Mono (code), all self-hosted. Light and dark mode are required. Touch targets are
at least 44 px and text meets WCAG AA contrast. Every interactive element has a visible
`:focus-visible` style; dialogs trap focus and close on `Escape`. Animate only `transform` and
`opacity`, never `transition: all`, and honour `prefers-reduced-motion`. Avoid gradients, emoji and generic
AI-looking layouts.
