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
   browser. Other APIs that need a key (weather, maps, …) are declared under `apis` in
   `mininode.json` and called with `mn.api(id)`; the admin enters the key on MiniNode.
3. **No custom auth:** the page is only served to signed-in users. Call
   `await mn.auth.requireLogin()` once at start-up. There is no sign-up/login UI in the app.
4. **Persistence:** never use `localStorage` or `IndexedDB` for user data (it does not sync
   across devices). Use `mn.kv` for simple data (it also works offline), or tables (below) for
   relational data. Do not add a service worker, web manifest or push code: the platform makes
   every app installable and offline-capable and delivers notifications (`mn.notify`,
   `mn.push`).
5. **UI in German and English.** Every text for people lives in two language packages,
   `i18n/de.json` and `i18n/en.json`, declared under `i18n` in `mininode.json`; the person's
   choice in the portal switches every app that has them. Markup keeps the German text and names
   the key (`data-i18n="app.title"`), script uses `mnI18n.t('list.count', { n })` from
   `/_mininode/i18n.js`. German uses the informal "du", English a plain "you". Both files have
   the same keys and placeholders (`mininode doctor` checks it); follow `LANGUAGE-PACKAGES.md`.
   Mobile-first, works from 360 px wide, touch targets
   at least 44 px, light and dark mode (`prefers-color-scheme`), WCAG AA contrast.
   **Look:** use the MiniNode App Kit (`DESIGN-SYSTEM.md`): link `/_mininode/ui.css` and
   `/_mininode/ui.js` (and `/_mininode/i18n.js`), put `class="mn-app"` on `<body>`, pick a `data-accent` and build from
   its `mn-*` components and `--mn-*` tokens.
6. Deliver a **ZIP** containing the project (source, `package.json` if any, `mininode.json`).
7. **Details that make an upload fail the check** (the integration script and `mininode doctor`
   stop on each of them):
   - **Name and address:** give the app its own name and slug (the brief names them); never leave
     "Neue App" or `neue-app` in `mininode.json`, the page title or the README.
   - **`mininode.json` has only the documented keys.** The accent colour is the HTML attribute
     `data-accent` on `<html>`, never a key in `mininode.json` (no `accent`, `theme`, `color`).
   - **The platform API is `@mininode/sdk` (or `window.mininode` in plain HTML) and nothing else.**
     There is no `window.MiniNode`, no host object to probe for and no "standalone fallback": do
     not write a bridge or a localStorage mode for "when MiniNode is not there". Import the SDK
     and use `mn.auth`, `mn.kv`, `mn.files` directly; data mode `private`, `shared-account` or
     `group` requires it.
   - **Sample data uses `@example.com` addresses** (`max@example.com`), never real-looking or
     localised ones (`@beispiel.de`, `@gmail.com`): such addresses stop the export of the app.

### The SDK

```ts
import { ExternalApiError, mininode } from '@mininode/sdk'; // Vite/React apps (npm package)
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

// Notification in the portal's bell for the current user (also pushed to their devices):
await mn.notify('Erinnerung', 'Müll rausbringen', '/heute');
// Reminder at a set time, delivered even when the app is closed (same key replaces it):
await mn.push.schedule({ key: `task:${id}`, at: dueDate, title: 'Müll rausbringen', path: '/heute' });
await mn.push.cancel(`task:${id}`);

// Offline: mn.kv keeps a local copy and queues changes made without internet; they are sent
// automatically when the device is online again. Reload the view after that:
mn.offline.onSynced(() => render());
const waiting = await mn.offline.pending();          // changes not on the server yet

// Gmail and Google Calendar of the signed-in user (declare "google" in mininode.json). The user
// connected Google once in the portal; the app never asks for a Google login or client ID:
const res = await mn.google.fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events');
const mails = await mn.google.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20');
if (!(await mn.google.connected())) showLink(mn.google.connectUrl()); // "Google verbinden"

// External APIs with a key (declare them under "apis" in mininode.json). The key stays on the
// server; the path is relative to the declared baseUrl:
try {
  const weather = await mn.api('openweathermap').json('/weather?q=München&units=metric');
} catch (err) {
  // keyMissing: not set up yet. needsPersonalKey: the admin chose personal keys; the SDK has already
  // shown the popup that leads the user to enter their own, so only show a quiet "not set up" state.
  if (err instanceof ExternalApiError && err.keyMissing) showSetupState(); // not an error screen
}

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
  "i18n": { "languages": ["de", "en"], "default": "de" },   // language packages i18n/de.json, i18n/en.json
  "access": { "default": true },            // true: every user gets it; false: admin grants it
  "data": { "mode": "private" },            // none | private | shared-account | group | readonly
  "ai": { "models": ["gemini-flash"], "monthlyBudgetEur": 2, "maxOutputTokens": 1500 },
  "google": { "gmail": "write", "calendar": "read" },   // only if the app uses Gmail/Calendar
  "apis": [{                                // only if the app calls an external API with a key
    "id": "openweathermap", "name": "OpenWeatherMap",
    "baseUrl": "https://api.openweathermap.org/data/2.5",
    "auth": { "type": "query", "param": "appid" },   // or { "type": "bearer" } / { "type": "header", "name": "X-Api-Key" }
    "docs": "https://home.openweathermap.org/api_keys",
    "reason": "Wetter für den Wohnort"
  }],
  "build": { "command": "pnpm build", "output": "dist" }   // omit for static apps
}
```

Data modes: `private` = each user their own data · `shared-account` = trusted users work on the
owner's data (e.g. a shared household budget) · `group` = everyone with the app shares all data ·
`readonly` = users read, only the admin writes.

Google: `"read"` sees mails or events; `"write"` also sends mails, changes labels and creates or
edits events. Ask for `write` only when the app needs it. Google API origins are allowed by the
platform automatically; do not add Google scripts or a Google client ID.

APIs: one entry per external API; `id` names the key, so apps using the same API with the same
`id`, `baseUrl` and `auth` share one key. Never ship a key or a "enter your API key" field.
