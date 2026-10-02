# Common steps (every playbook ends here)

1. **Slug and folder.** Choose a short lowercase slug (the subdomain). Move the result to
   `hosted/<slug>/`. The folder name must equal `slug` in the manifest.
2. **Manifest.** Write `hosted/<slug>/mininode.json` (schema: `packages/manifest/schema.json`).
   Pick the data mode deliberately:
   - personal tools → `private`
   - one household/family account used by trusted people → `shared-account`
   - collaborative boards, lists, games → `group`
   - reference content → `readonly`
3. **Login.** The app calls `await mn.auth.requireLogin()` once before rendering. Remove any
   own login/sign-up UI, user pickers or "enter your name" prompts (use `mn.auth.user()` and
   `platform.profiles.display_name` instead).
4. **Data.** Replace `localStorage`/`IndexedDB`/in-memory "databases" with `mn.kv`. Use tables
   (`db/NNN_*.sql` with `platform.create_app_schema` + `platform.secure_table`) only for lists
   that need filtering, sorting or relations.
5. **AI.** Replace any provider SDK or key with `mn.ai.chat|stream|json`; declare the models in
   `ai.models` and a sensible `monthlyBudgetEur` and `maxOutputTokens`. Show a friendly message
   for `AiError.code === 'budget_exceeded'`.
6. **CSP.** No external scripts. Fonts and images from third parties are allowed (`img-src https:`)
   but prefer bundling. API calls to third-party hosts need to be listed in the manifest in a
   later spec version; for now avoid them or proxy through `mn.ai`.
7. **Language packages.** Move every text for people into `i18n/de.json` and `i18n/en.json`
   (Vite apps: `public/i18n/`), name them in `mininode.json` (`"i18n"`), and use `data-i18n` in
   markup and `mnI18n.t()` in script; see `docs/ai/LANGUAGE-PACKAGES.md`. Doctor checks key and
   placeholder parity. An export without them gets a warning (`i18n-missing`) until they exist.
8. **UI.** German copy, 44 px touch targets, light/dark, loading and error states. The look is
   the App Kit (`docs/ai/DESIGN-SYSTEM.md`):
   - An app that already uses `mn-*` classes with the kit CSS inlined (built outside MiniNode):
     delete the inlined copy and link `/_mininode/ui.css` and `/_mininode/ui.js` instead, keep
     `body.mn-app` and `data-accent`.
   - An app with its own styling: map its colours, fonts and radii to the `--mn-*` tokens and
     its shell, buttons, lists and dialogs to the kit components where that is a small change.
     Otherwise keep its layout, but take colours and fonts from the tokens; note what is left in
     the README.
9. **README.** `hosted/<slug>/README.md`: what the app does, where it came from, what changed.
10. **Verify locally.**
   ```bash
   pnpm db:start                                   # once
   pnpm install
   pnpm mininode doctor hosted/<slug>              # must print "ok"
   scripts/with-local-supabase.sh pnpm mininode dev hosted/<slug>
   # sign in at http://localhost:5173, then open http://localhost:8790
   ```
   Exercise every feature once (create, reload, second device/user if shared).
11. **Commit** on a branch: `feat(<slug>): integrate <source> export`. Open a PR. CI runs doctor,
    lint, tests and a dry-run deploy; merging deploys.
