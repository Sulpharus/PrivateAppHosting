# Playbook: static HTML

Reference: `fixtures/static-html/` (input → expected).

1. Keep the files; `kind: "static"`, no `build` block (or a build if it uses a bundler).
2. Replace CDN scripts with local copies in the folder (download the exact version), or rewrite
   small helpers by hand. Inline `<script>` blocks may stay only if moved to a file — the CSP
   blocks inline scripts. Inline styles are fine.
3. Add `<script src="/_mininode/sdk.js" defer></script>` before the app script and start with
   `const mn = await window.mininode.mininode(); await mn.auth.requireLogin();` inside a
   `DOMContentLoaded` handler.
4. `localStorage` → `mn.kv`.
5. Continue with [common steps](common-steps.md).
