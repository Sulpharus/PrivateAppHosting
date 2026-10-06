# @mininode/sdk

The single dependency a hosted app needs. It reads its configuration from the app's gate
(`/_mininode/config.json`), so the same build runs on staging and production.

```ts
import { mininode } from '@mininode/sdk';

const mn = await mininode();
const user = await mn.auth.requireLogin();          // redirects to mininode.app/login if needed

await mn.kv.set('settings', { theme: 'dark' });      // settings and small state; private per user (or per owner in shared-account apps)
const recipes = mn.table('recipes');                // a list of entries = a table; offline like kv (ADR 0022)
await recipes.upsert({ id: recipes.newId(), title: 'Suppe' }); await recipes.list(); await recipes.remove(id);
await mn.kv.set('motd', 'Hallo', 'shared');          // visible to everyone with the app
const { data } = await mn.db.from('recipes').select(); // tables in app_<slug>, secured by RLS
await mn.files.upload('fotos/a.jpg', file);
const answer = await mn.ai.chat('Fasse zusammen: …');  // via ai.mininode.app, no keys in the client
const events = await mn.google.fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events'); // "google" in mininode.json (ADR 0004)
await mn.google.calendarSync.get(); // Kalender only: Google Calendar sync state, set() and sync() (ADR 0010)
const weather = await mn.api('openweather').json('/weather?q=München'); // "apis" in mininode.json, key stays on the server (ADR 0006)
const people = await mn.people();                    // others with this app: [{ id, name }] (for sharing)
await mn.suite.type('event').upsert({ title, starts_at }, { sourceKey }); // shared records (ADR 0002)
await mn.suite.range({ from, to });                // every readable record in a time range
await mn.suite.collections('kalender');            // personal and shared collections
const stop = mn.game.track();                      // games: count playtime while visible (ADR 0009)
await mn.game.result('win', { moves: 24 }, 95);    // a finished round with its declared stats
await mn.game.username();                          // the player's Gaming Hub name, or null
await mn.game.leaderboard('moves', 10);            // [{ rank, username, value, mine }]
await mn.notify('Erinnerung', 'Müll rausbringen');   // bell + push to the user's devices
await mn.push.schedule({ key: 'task:1', at: tomorrow8am, title: 'Müll rausbringen' }); // ADR 0005
mn.offline.onSynced(render);                           // mn.kv works offline, changes sync later
mn.realtime('board').on('broadcast', { event: 'move' }, handler).subscribe();
```

Plain HTML apps load the standalone build instead: `<script src="/_mininode/sdk.js"></script>`,
then `const mn = await window.mininode.mininode();`.

Data calls (`kv`, `db`, `files`, `notify`) only work from the app's registered origin, because
RLS identifies the calling app by the browser's `Origin` header (ADR 0002). Deploys register
`https://<slug>.<domain>`, and `mininode dev` registers its localhost port. Requests from any
other page, e.g. a plain Vite dev server on another port, see no data.

External APIs with keys (weather, maps, …) are declared in the manifest's `apis` block and called
through `mn.api(id).fetch(path, init)` (the API's own response) or `.json(path)`. The admin enters
each key once under Verwaltung → API-Schlüssel; until then calls throw an `ExternalApiError`
with `keyMissing === true`. When the admin set the API to personal keys, the SDK also shows a popup
(once, "Schlüssel einrichten" / "Später") that leads to the account page where the user enters their
own key; the error then has `needsPersonalKey === true` (ADR 0014).

Apps built for other shims keep working through two compatibility layers that `mininode integrate`
wires in: `installMiniNodeCompat(mn)` defines `window.MiniNode` (auth, `db` → `mn.kv`, `ai` →
`mn.ai`) and `installLocalStorageSync(mn)` keeps `localStorage` in the account (ADR 0013).

## Development

- `pnpm build` → `dist/mininode.js` (ESM) and `dist/mininode.iife.js` (`window.mininode`)
- `pnpm test` runs unit tests; the integration suite runs when `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` point at a local stack (`pnpm test:integration`
  from the repo root sets them).
