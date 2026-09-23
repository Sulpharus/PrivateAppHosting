# @mininode/cli — `pnpm mininode`

```
mininode doctor <app-dir> | --all          Check hosted apps
mininode dev <app-dir> [--port 8790]       Serve an app locally behind the gate (local Supabase)
mininode deploy <app-dir> [--env staging]  Build, migrate, deploy and register one app
mininode deploy --changed <base-ref>       Deploy every app changed since <base-ref> (--dry-run)
mininode changed <base-ref>                List hosted apps changed since <base-ref>
```

**doctor** is the gate every AI-integrated app must pass (CI runs `--all`). Errors block the
deploy, warnings are shown in review:

| Rule | Checks |
|---|---|
| `manifest` | `mininode.json` parses against `@mininode/manifest` |
| `no-secrets`, `no-client-ai-keys`, `no-client-ai-sdk` | no keys or provider SDKs in client code; AI goes through `mn.ai` |
| `no-artifact-runtime`, `no-cdn-scripts` | no leftover `window.claude`/`window.storage`, no external scripts (CSP) |
| `sdk-required`, `prefer-kv` | apps with login or data use the SDK; small state uses `mn.kv` |
| `rls-required`, `use-secure-table`, `own-schema`, `no-anon-grants` | migrations stay in `app_<slug>`, enable RLS via `platform.secure_table`, never grant to `anon` |
| `build`, `static`, `container` | target-specific: build output exists, Dockerfile + health path for NucBox apps |
| `readme` | every app documents what it does and its data |

**deploy** (target `cloudflare`): builds, applies the app's SQL migrations (checksummed in
`platform.app_migrations`), exposes the schema to the API, deploys a Worker with the gate and
static assets on `<slug>.mininode.app`, and registers the app in `platform.apps`. Other targets
are registered only; their rollout happens in the deploy workflow (NucBox) or the admin UI
(remote installs).
