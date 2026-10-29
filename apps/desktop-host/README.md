# @mininode/desktop-host

Runs the platform on one computer (ADR 0026): the portal, the API, the AI proxy and the gate of
every installed app, as the same Workers that run on Cloudflare, in workerd through Miniflare, behind
one port. Supabase runs next to it in Docker (`infra/desktop`).

- `src/config.ts`: environment of the host (domain, scheme, port, keys); derives every address.
- `src/bundle.ts`: bundles the four Workers with esbuild (`node src/bundle.ts <outdir>`).
- `src/options.ts`: the Miniflare configuration: router, shared asset store with one shim per app,
  Supabase proxy (also the outbound service of every Worker), portal, API, AI proxy, app gates.
- `src/edge.ts`: the small Workers in front (host router, Supabase proxy, asset store and shim).
- `src/apps.ts`: installed apps from `<DATA_DIR>/apps/<slug>/app.json` and `<DATA_DIR>/served/<slug>/`.
- `src/scheduler.ts`: the API's cron triggers.
- `src/main.ts`: starts everything and reloads when `apps.changed` is touched by a deploy.

`pnpm --filter @mininode/desktop-host test` starts a real Miniflare with stand-in Workers and checks
routing, SPA and 404 handling and that one app can never read another's files.
Installation and daily use: `docs/runbooks/setup-desktop.md`.
