# Playbook: Claude artifact

Typical export: one `App.jsx`/`.tsx` (React, default export), Tailwind classes, sometimes
shadcn/lucide imports, `window.claude.complete(prompt)` for AI and `window.storage.get/set`
for persistence. No `package.json`.

Reference: `fixtures/claude-artifact/` (input → expected).

1. **Scaffold** a Vite + React app in `hosted/<slug>/`: `package.json` (react, react-dom,
   `@mininode/sdk: workspace:*`, vite, `@vitejs/plugin-react`, plus `tailwindcss` +
   `@tailwindcss/vite` if Tailwind classes are used; `lucide-react` if icons are imported),
   `index.html`, `vite.config.*`, `src/main.jsx`, the artifact as `src/App.jsx`.
2. **Bootstrap** in `main.jsx`: `const mn = await mininode(); await mn.auth.requireLogin();`
   and pass `mn` to `App` (prop or React context).
3. **Storage:** `window.storage.get(key)` returns `{ value }` with a JSON string →
   `await mn.kv.get(key)` returns the parsed value (or `null`). `window.storage.set(key, JSON.stringify(v))`
   → `mn.kv.set(key, v)`. Shared artifact storage (`shared: true`) → `mn.kv.set(key, v, 'shared')`.
4. **AI:** `window.claude.complete(prompt)` → `mn.ai.chat(prompt, { model: 'claude-haiku' })`.
   If the artifact asks for JSON in the prompt and parses it, use `mn.ai.json(prompt, schema)`
   with a JSON Schema instead. Declare `ai.models` in the manifest.
5. **shadcn/ui imports** (`@/components/ui/*`): replace with plain elements styled with Tailwind,
   or add the few needed components as local files. Do not add a component library for one button.
6. Continue with [common steps](common-steps.md).
