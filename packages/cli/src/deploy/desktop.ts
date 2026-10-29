import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from '@mininode/manifest';

/** Where the desktop host keeps its apps (the `DATA_DIR` of apps/desktop-host). */
export function desktopDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATA_DIR ?? '/data';
}

/**
 * "Deploying" to a desktop installation: the built files go into the host's data folder and the
 * host is told to reload. The folder is swapped in one rename, so a request never sees half an app.
 */
export function installDesktopApp(
  assetsRoot: string,
  manifest: Manifest,
  vars: { CONNECT_SRC?: string; WASM?: string },
  dataDir: string,
): void {
  const served = join(dataDir, 'served');
  const description = join(dataDir, 'apps', manifest.slug);
  const fresh = join(served, `.${manifest.slug}.new`);
  mkdirSync(served, { recursive: true });
  mkdirSync(description, { recursive: true });
  rmSync(fresh, { recursive: true, force: true });
  cpSync(assetsRoot, fresh, { recursive: true });
  writeFileSync(
    join(description, 'app.json'),
    JSON.stringify({
      slug: manifest.slug,
      name: manifest.name,
      kind: manifest.kind === 'static' ? 'static' : 'spa',
      connectSrc: vars.CONNECT_SRC ?? '',
      wasm: vars.WASM === '1',
    }),
  );
  const target = join(served, manifest.slug);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  renameSync(fresh, target);
  writeFileSync(join(dataDir, 'apps.changed'), `${Date.now()}\n`);
}

/** Takes an app off the desktop host. */
export function removeDesktopApp(slug: string, dataDir: string): void {
  rmSync(join(dataDir, 'apps', slug), { recursive: true, force: true });
  rmSync(join(dataDir, 'served', slug), { recursive: true, force: true });
  writeFileSync(join(dataDir, 'apps.changed'), `${Date.now()}\n`);
}
