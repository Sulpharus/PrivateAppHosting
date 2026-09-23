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
6. Continue with [common steps](common-steps.md).
