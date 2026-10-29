import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * `<DATA_DIR>/apps/<slug>/app.json`, written by `mininode deploy --env desktop` together with the
 * files in `<DATA_DIR>/served/<slug>/`.
 */
const appFile = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/),
  name: z.string().min(1).max(80),
  kind: z.enum(['static', 'spa']).default('spa'),
  connectSrc: z.string().default(''),
  wasm: z.boolean().default(false),
});

export type InstalledApp = z.infer<typeof appFile>;

/** The web apps that are installed on this computer: a folder with app.json and its files in served/. */
export function installedApps(dataDir: string): InstalledApp[] {
  const root = join(dataDir, 'apps');
  if (!existsSync(root)) return [];
  const apps: InstalledApp[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, 'app.json');
    if (!existsSync(file) || !existsSync(join(dataDir, 'served', entry.name))) continue;
    try {
      const parsed = appFile.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      // The folder name is the slug: a mismatch would let one app answer for another's address.
      if (parsed.success && parsed.data.slug === entry.name) apps.push(parsed.data);
      else console.warn(`ignoring ${file}: not a valid app description`);
    } catch {
      console.warn(`ignoring ${file}: not valid JSON`);
    }
  }
  return apps.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Service binding names are identifiers. */
export const bindingName = (slug: string): string =>
  `APP_${slug.replaceAll('-', '_').toUpperCase()}`;
