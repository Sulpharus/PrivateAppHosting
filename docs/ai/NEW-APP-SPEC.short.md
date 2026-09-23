<!-- Generated from NEW-APP-SPEC.md by scripts/generate-short-spec.ts. Do not edit. -->
# MiniNode app spec (short, specVersion 1)

## You are building an app for MiniNode

MiniNode is a private, invite-only platform. Every app runs at `https://<slug>.mininode.app`
behind a shared login. The platform provides accounts, a database, file storage, realtime and
AI access through one small SDK. **Build a normal web app and use the SDK for everything that
needs a backend. Do not build your own login, backend or API-key handling.**

### Hard rules

1. **Stack:** a static site (HTML/CSS/JS) or a Vite + React (TypeScript preferred) single-page
   app. Everything must be bundled at build time: no CDN `<script>` tags, no import maps,
   no `esm.sh`. Tailwind via `@tailwindcss/vite`, not the CDN.
2. **No secrets in the app:** never put API keys in code, env files or `process.env.*`. For AI,
   call `mn.ai` (below). Never import `@google/genai`, `@anthropic-ai/sdk` or `openai` in the
   browser.
3. **No custom auth:** the page is only served to signed-in users. Call
   `await mn.auth.requireLogin()` once at start-up. There is no sign-up/login UI in the app.
4. **Persistence:** never use `localStorage` or `IndexedDB` for user data (it does not sync
   across devices). Use `mn.kv` for simple data, or tables (below) for relational data.
5. **UI language German**, informal "du". Mobile-first, works from 360 px wide, touch targets
   at least 44 px, light and dark mode (`prefers-color-scheme`), WCAG AA contrast.
6. Deliver a **ZIP** containing the project (source, `package.json` if any, `mininode.json`).

### The SDK

```ts
import { mininode } from '@mininode/sdk';        // Vite/React apps (npm package)
// Plain HTML: <script src="/_mininode/sdk.js"></script> then: const mn = await window.mininode.mininode();

const mn = await mininode();
const user = await mn.auth.requireLogin();      // { id, email, … }; redirects to login if needed
const role = await mn.auth.role();              // 'admin' | 'trusted' | 'user'

// Key-value storage, private per user (or shared with everyone who has the app):
await mn.kv.set('settings', { theme: 'dark' });
const settings = await mn.kv.get('settings');   // null if missing
await mn.kv.set('motd', 'Hallo', 'shared');
const all = await mn.kv.list('prefix-');        // [{ key, value }]
await mn.kv.delete('settings');

// AI (keys stay on the server, costs count against a per-user budget):
const text = await mn.ai.chat('Fasse zusammen: …', { model: 'gemini-flash' });
for await (const chunk of mn.ai.stream(messages, { system: '…' })) render(chunk);
const data = await mn.ai.json<Recipe[]>('Drei Rezepte mit Reis', jsonSchema);
// models: 'gemini-flash' | 'gemini-pro' | 'claude-haiku' | 'claude-sonnet' (declare in mininode.json)
// errors: AiError with .code 'budget_exceeded' | 'model_not_allowed' | … → show a friendly message

// Files (private per user; { shared: true } for shared files):
await mn.files.upload('fotos/urlaub.jpg', file);
const url = await mn.files.url('fotos/urlaub.jpg'); // signed URL, 1 h
const names = await mn.files.list('fotos');

// Realtime (live updates between users of the app):
mn.realtime('board').on('broadcast', { event: 'move' }, ({ payload }) => apply(payload)).subscribe();

// Notification in the portal's bell for the current user:
await mn.notify('Erinnerung', 'Müll rausbringen', '/heute');

// Relational data (only if kv is not enough): tables in your own schema, see "Tables".
const { data } = await mn.db.from('recipes').select('*').order('created_at');
```

### Tables (optional)

Only when you need queries, relations or large lists. Put SQL in `db/001_init.sql`:

```sql
select platform.create_app_schema('<slug>');

create table app_<slug_with_underscores>.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,                -- required for 'private' and 'shared-account' data
  title text not null,
  created_at timestamptz not null default now()
);
select platform.secure_table('<slug>', 'recipes', 'private');
```

- Always schema-qualify tables with `app_<slug>`; call `platform.secure_table` for every table.
- Never write `create policy`, `grant … to anon` or `disable row level security`.
- `owner_id` is filled automatically; do not set it from the client.
- Add a new numbered file for later changes; never edit an applied file.

### `mininode.json`

```jsonc
{
  "$schema": "https://mininode.app/schema/mininode.json",
  "specVersion": 1,
  "slug": "rezepte",                        // lowercase, digits, dashes; becomes rezepte.mininode.app
  "name": "Rezepte",
  "description": "Rezepte und Wochenplan",  // max 120 chars, shown on the start page
  "kind": "spa",                            // "static" (plain HTML) or "spa" (Vite build)
  "target": "cloudflare",
  "access": { "default": true },            // true: every user gets it; false: admin grants it
  "data": { "mode": "private" },            // none | private | shared-account | group | readonly
  "ai": { "models": ["gemini-flash"], "monthlyBudgetEur": 2, "maxOutputTokens": 1500 },
  "build": { "command": "pnpm build", "output": "dist" }   // omit for static apps
}
```

Data modes: `private` = each user their own data · `shared-account` = trusted users work on the
owner's data (e.g. a shared household budget) · `group` = everyone with the app shares all data ·
`readonly` = users read, only the admin writes.
