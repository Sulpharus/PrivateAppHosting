// The desktop host: runs the platform Workers (portal, API, AI proxy and one gate per app) in
// workerd through Miniflare, behind one port. Supabase runs next to it in Docker.

import { cpSync, mkdirSync, rmSync, watch } from 'node:fs';
import { join } from 'node:path';

import { Miniflare } from 'miniflare';
import { installedApps } from './apps.ts';
import { loadConfig } from './config.ts';
import { miniflareOptions } from './options.ts';
import { startScheduler } from './scheduler.ts';

const config = loadConfig();
// The portal's files go next to the apps' in the one store (see edge.ts); refreshed on every start.
const served = join(config.DATA_DIR, 'served');
mkdirSync(served, { recursive: true });
rmSync(join(served, '_portal'), { recursive: true, force: true });
cpSync(config.PORTAL_DIST, join(served, '_portal'), { recursive: true });
let apps = installedApps(config.DATA_DIR);
const mf = new Miniflare(miniflareOptions(config, apps));
await mf.ready;
console.log(
  `MiniNode desktop host: ${config.portalUrl}  (${apps.length} app(s): ${apps.map((a) => a.slug).join(', ') || 'none yet'})`,
);

// A deploy writes the app folder and then touches this marker; reload the Workers once.
let reload: NodeJS.Timeout | undefined;
const applyApps = () => {
  clearTimeout(reload);
  reload = setTimeout(async () => {
    const next = installedApps(config.DATA_DIR);
    if (JSON.stringify(next) === JSON.stringify(apps)) return;
    apps = next;
    await mf.setOptions(miniflareOptions(config, apps));
    console.log(`apps reloaded: ${apps.map((a) => a.slug).join(', ') || 'none'}`);
  }, 500);
};
watch(config.DATA_DIR, { recursive: false }, (_event, name) => {
  if (name === 'apps.changed') applyApps();
});
applyApps();

if (!config.NO_SCHEDULER) startScheduler(mf);

const stop = async () => {
  await mf.dispose();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
