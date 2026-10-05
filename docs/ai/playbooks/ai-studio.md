# Playbook: Google AI Studio export

Typical export: `index.html` with an import map (`esm.sh`) and the Tailwind CDN script,
`index.tsx`, `App.tsx`, `components/`, `services/geminiService.ts` using `@google/genai`
with `process.env.API_KEY` (or `GEMINI_API_KEY`), `metadata.json`, sometimes `vite.config.ts`
with `define: { 'process.env.API_KEY': … }`.

Reference: `fixtures/ai-studio/` (input → expected).

1. **Project:** ensure a real Vite project: `package.json` with every package from the import
   map as a pinned dependency, `@mininode/sdk: workspace:*`, `vite`, `@vitejs/plugin-react`,
   `typescript`. Delete the import map and CDN scripts from `index.html`; point the module
   script at `/src/main.tsx` (move sources under `src/`).
2. **Tailwind:** replace `cdn.tailwindcss.com` with `tailwindcss` + `@tailwindcss/vite`, a
   `src/styles.css` containing `@import "tailwindcss";` imported from `main.tsx`. Move any inline
   `tailwind.config` from `index.html` into CSS `@theme` variables.
3. **Remove the key:** delete `define` for API keys from `vite.config.ts`, delete `.env*`,
   `metadata.json` (keep its `name`/`description` for the manifest).
4. **AI calls** in the Gemini service:
   - `ai.models.generateContent({ contents })` returning text → `mn.ai.chat(contents, { model })`.
   - with `responseMimeType: 'application/json'` + `responseSchema` → `mn.ai.json(contents, schema)`;
     convert `Type.OBJECT/STRING/ARRAY/NUMBER/BOOLEAN` to plain JSON Schema strings.
   - `generateContentStream` → `for await (const chunk of mn.ai.stream(...))`.
   - `systemInstruction` → `{ system }`; chat history → `messages` array
     (`role: 'user' | 'assistant'`).
   - Model names: `gemini-*-flash*` → `'gemini-flash'`, `*-pro*` → `'gemini-pro'`.
   - Image generation, live audio and tool calling are not proxied yet: remove the feature or
     mark the app `ai`-less and tell the admin in the PR.
5. **Bootstrap** `mn` in `main.tsx` before rendering; pass it down.
6. **Fonts and icons:** exports load Google Fonts and *Material Symbols* from `fonts.googleapis.com`;
   the CSP blocks both (the icon names then show as plain text and the layout falls apart). Fonts:
   `@fontsource-variable/<font>` imported in `main.tsx`, family names `"<Font> Variable"` in the CSS.
   Icons: `python3 scripts/subset-icons.py hosted/<slug>` and
   `<link rel="stylesheet" href="/fonts/material-symbols.css">` in `index.html`. Remove images that
   point to `lh3.googleusercontent.com/aida-public/…` (they expire).
7. **Exports that bring their own client:** many AI Studio exports with a `mininode.json` come with a
   `src/mininode.ts` that wraps `window.mininode` and falls back to `localStorage`/IndexedDB, or
   invents `window.MiniNode`. Replace it by the SDK (`import { mininode } from '@mininode/sdk'`) and
   keep its public functions so the screens stay as they are.
8. Continue with [common steps](common-steps.md).
