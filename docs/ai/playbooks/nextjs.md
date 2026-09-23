# Playbook: Next.js

Choose the first option that works (per Cloudflare's current guidance):

1. **Static export** (`output: 'export'`) when the app has no server actions, route handlers
   or SSR data needs → treat it as `kind: "spa"`, `build.output: "out"`, then the
   [vite-react](vite-react.md) steps for SDK, data and auth.
2. **vinext** (Next.js on Workers, beta): run `npx vinext check`; if green, follow the
   `nextjs-on-cloudflare` skill. `kind: "nextjs"`, `target: "cloudflare"`. Server code must use
   the SDK only from the client or verify the `mn-auth` session with `@mininode/gate` helpers.
3. **OpenNext** (`@opennextjs/cloudflare`) for existing apps that vinext cannot run.
4. **Vercel** (`target: "vercel"`) only if 2 and 3 fail; note the reason in the PR.

Never keep server-side secrets in the repo; ask the admin to add them as Worker secrets.
