# Playbook: Vite / React (or Vue, Svelte) SPA

1. Keep the project structure; add `@mininode/sdk: workspace:*` to dependencies.
2. Bootstrap `const mn = await mininode(); await mn.auth.requireLogin();` before rendering.
3. Find persistence (`localStorage`, `IndexedDB`, `idb`, `dexie`, Firebase, Supabase with its own
   project) and move it to `mn.kv` or app tables. Remove foreign backends and their keys.
4. Find auth (Firebase Auth, Clerk, Auth0, own forms) and remove it; use `mn.auth`.
5. Find AI/API keys (`import.meta.env.VITE_*KEY*`, `process.env.*`) → `mn.ai` or remove.
6. Router: keep client-side routing; the gate serves `index.html` for unknown paths
   (`kind: "spa"`). Assets must be emitted under `/assets/` (Vite default).
7. `build.output` is `dist` unless the project changes `outDir`.
8. Continue with [common steps](common-steps.md).
