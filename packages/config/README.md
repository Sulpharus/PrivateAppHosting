# @mininode/config

Shared TypeScript configurations. Extend one of them from a package's `tsconfig.json`:

| File | Use for |
|---|---|
| `tsconfig.base.json` | Plain TypeScript libraries (Node or isomorphic) |
| `tsconfig.dom.json` | Browser code and React UIs |
| `tsconfig.worker.json` | Cloudflare Workers (add the generated `worker-configuration.d.ts`) |

Lint and format rules live in the root `biome.json`.
