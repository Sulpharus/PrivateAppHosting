# Playbook: Claude artifact

Two kinds of exports:

- **Built with the KI-Werkstatt prompt (ADR 0030):** a ZIP with real files made in Claude's code
  environment from the starter package. It already loads `/_mininode/*` and uses `mn`; integrate it
  like a static or Vite app (`static-html.md`, `vite-react.md`) and finish with the common steps.
- **A classic artifact** (made before the composer's Claude variant, or by hand): one
  `App.jsx`/`.tsx` (React, default export), Tailwind classes, sometimes shadcn/lucide imports,
  `window.claude.complete(prompt)` for AI and `window.storage.get/set` for persistence. No
  `package.json`. Newer artifacts may use `claude.use('db')` and `claude.use('sample')` instead;
  map them the same way as below. The rest of this playbook is for this kind.

Reference: `fixtures/claude-artifact/` (input → expected).

1. **Scaffold** a Vite + React app in `hosted/<slug>/`: `package.json` (react, react-dom,
   `@mininode/sdk: workspace:*`, vite, `@vitejs/plugin-react`, plus `tailwindcss` +
   `@tailwindcss/vite` if Tailwind classes are used; `lucide-react` if icons are imported),
   `index.html`, `vite.config.*`, `src/main.jsx`, the artifact as `src/App.jsx`.
2. **Bootstrap** in `main.jsx`: `const mn = await mininode(); await mn.auth.requireLogin();`
   and pass `mn` to `App` (prop or React context).
3. **Storage:** a list of entries (keys like `item:<id>`, or one key holding an array of entries)
   becomes a table (`db/001_init.sql`, `mn.table`, ADR 0022) with a one-time import of the old
   values. Settings and small state: `window.storage.get(key)` returns `{ value }` with a JSON
   string → `await mn.kv.get(key)` returns the parsed value (or `null`);
   `window.storage.set(key, JSON.stringify(v))` → `mn.kv.set(key, v)`. Shared artifact storage
   (`shared: true`) → `mn.kv.set(key, v, 'shared')` or a table in data mode `group`.
4. **AI:** `window.claude.complete(prompt)` → `mn.ai.chat(prompt, { model: 'claude-haiku' })`.
   If the artifact asks for JSON in the prompt and parses it, use `mn.ai.json(prompt, schema)`
   with a JSON Schema instead. Declare `ai.models` in the manifest.
5. **shadcn/ui imports** (`@/components/ui/*`): replace with plain elements styled with Tailwind,
   or add the few needed components as local files. Do not add a component library for one button.
6. Continue with [common steps](common-steps.md).
