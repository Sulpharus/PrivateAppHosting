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
await mn.notify('Erinnerung', 'Müll rausbringen');
mn.realtime('board').on('broadcast', { event: 'move' }, handler).subscribe();
```

Plain HTML apps load the standalone build instead: `<script src="/_mininode/sdk.js"></script>`,
then `const mn = await window.mininode.mininode();`.

## Development

- `pnpm build` → `dist/mininode.js` (ESM) and `dist/mininode.iife.js` (`window.mininode`)
- `pnpm test` runs unit tests; the integration suite runs when `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` point at a local stack (`pnpm test:integration`
  from the repo root sets them).
