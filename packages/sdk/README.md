# @mininode/sdk

The single dependency a hosted app needs. It reads its configuration from the app's gate
(`/_mininode/config.json`), so the same build runs on staging and production.

```ts
import { mininode } from '@mininode/sdk';

const mn = await mininode();
const user = await mn.auth.requireLogin();          // redirects to mininode.app/login if needed

await mn.kv.set('settings', { theme: 'dark' });      // private per user (or per owner in shared-account apps)
await mn.kv.set('motd', 'Hallo', 'shared');          // visible to everyone with the app
const { data } = await mn.db.from('recipes').select(); // tables in app_<slug>, secured by RLS
await mn.files.upload('fotos/a.jpg', file);
const answer = await mn.ai.chat('Fasse zusammen: …');  // via ai.mininode.app, no keys in the client
const events = await mn.google.fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events'); // "google" in mininode.json (ADR 0004)
const weather = await mn.api('openweather').json('/weather?q=München'); // "apis" in mininode.json, key stays on the server (ADR 0006)
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
with `keyMissing === true`.

## Development

- `pnpm build` → `dist/mininode.js` (ESM) and `dist/mininode.iife.js` (`window.mininode`)
- `pnpm test` runs unit tests; the integration suite runs when `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` point at a local stack (`pnpm test:integration`
  from the repo root sets them).
