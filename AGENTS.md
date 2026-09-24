# Agent instructions

The canonical instructions for every coding agent (Claude Code, Codex, Gemini CLI, Cursor,
Copilot) are in [CLAUDE.md](CLAUDE.md): layout, commands, security rules (RLS is the
boundary), UI rules and the knowledge graph (`graphify`, see `graphify-out/`). Architecture
and scope: [PLAN.md](PLAN.md) and [docs/adr/](docs/adr/).

Verification gate before every commit:

```bash
pnpm check        # Biome lint + typecheck + unit tests
pnpm db:test      # when supabase/ changed (needs Docker)
```

CI additionally runs gitleaks, pgTAP, integration and Playwright e2e tests, shellcheck and the
nucbox-control image smoke test.
