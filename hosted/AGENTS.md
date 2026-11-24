# Rules for apps in hosted/

Read before you build or change an app here. The full specification is `docs/ai/NEW-APP-SPEC.md`,
the look `docs/ai/DESIGN-SYSTEM.md`, the texts `docs/ai/LANGUAGE-PACKAGES.md`; feature guidance per
topic is in `docs/ai/prompts/modules/`. Repository rules: `CLAUDE.md`.

1. One folder per app: `hosted/<slug>/` with `mininode.json` (slug = folder name), a README and
   `i18n/de.json` + `i18n/en.json` (Vite apps: `public/i18n/`).
2. Use the SDK for login, data, files, AI and external APIs: `@mininode/sdk` in Vite apps,
   `<script src="/_mininode/sdk.js">` and `window.mininode.mininode()` in static ones. No own login,
   backend, API keys or provider SDKs; no fallback, mock or `window.MiniNode`; no `_mininode/` folder.
3. Every list of entries is a table: `db/001_init.sql` (`platform.create_app_schema`, typed columns,
   `platform.secure_table` per table, never `create policy` or grants to `anon`), used through
   `mn.table`. `mn.kv` holds settings and small state. Later changes go into new numbered files.
4. The App Kit only: `/_mininode/ui.css`, `ui.js`, `i18n.js`; `body.mn-app`, `data-accent`, `mn-*`
   components and `--mn-*` tokens. No Tailwind, CDN scripts, raw colours or fonts.
5. Every text for people in both language packages; formats follow `mnI18n.locale`.
6. 360 px first, 44 px targets, light and dark, visible focus, loading, empty and error states.
7. Done means: `pnpm mininode doctor hosted/<slug>` is `ok`, `pnpm check` passes, an e2e test under
   `e2e/` covers the main action, and `docs/wiki/neuigkeiten.md` has a line.
