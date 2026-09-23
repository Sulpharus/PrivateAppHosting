import { fileURLToPath } from 'node:url';
import type { Manifest } from '@mininode/manifest';
import type { EnvironmentSettings } from './environment.ts';

export const COMPATIBILITY_DATE = '2026-09-23';

export const GATE_ENTRY = fileURLToPath(new URL('../../../gate/src/worker.ts', import.meta.url));

/** Wrangler config for a `target: cloudflare` app: static assets behind the platform gate. */
export function appWranglerConfig(input: {
  manifest: Manifest;
  env: EnvironmentSettings;
  assetsDir: string;
  connectSrc?: readonly string[];
}) {
  const { manifest, env } = input;
  const hostname = `${manifest.slug}.${env.domain}`;
  return {
    $schema: 'https://unpkg.com/wrangler/config-schema.json',
    name: `${env.workerPrefix}${manifest.slug}`,
    main: GATE_ENTRY,
    compatibility_date: COMPATIBILITY_DATE,
    observability: { enabled: true, traces: { enabled: true } },
    assets: {
      directory: input.assetsDir,
      binding: 'ASSETS',
      not_found_handling: manifest.kind === 'static' ? '404-page' : 'single-page-application',
      // Hashed build assets skip the Worker; every page load and config request passes the gate.
      run_worker_first: ['/*', '!/assets/*'],
    },
    ...(env.name === 'local' ? {} : { routes: [{ pattern: hostname, custom_domain: true }] }),
    vars: {
      APP_SLUG: manifest.slug,
      APP_NAME: manifest.name,
      SUPABASE_URL: env.supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: env.supabasePublishableKey,
      PORTAL_URL: env.portalUrl,
      CONNECT_SRC: (input.connectSrc ?? []).join(','),
    },
  };
}
