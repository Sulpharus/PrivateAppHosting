import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MiniflareOptions } from 'miniflare';
import { bindingName, type InstalledApp } from './apps.ts';
import type { DesktopConfig } from './config.ts';
import {
  ASSET_SHIM_SCRIPT,
  ASSET_STORE_SCRIPT,
  ROUTER_SCRIPT,
  SUPABASE_PROXY_SCRIPT,
} from './edge.ts';

// The newest date the bundled workerd knows; the platform Workers use 2026-09-23 on Cloudflare.
const COMPATIBILITY_DATE = '2026-07-15';

type Bindings = Record<string, string>;

/** Drops unset optional values: a Worker binding is always a string. */
function defined(values: Record<string, string | undefined>): Bindings {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function bundled(config: DesktopConfig, name: string) {
  const scriptPath = join(config.WORKERS_DIR, `${name}.mjs`);
  // Read here so that a missing bundle fails with a clear message, not inside workerd.
  readFileSync(scriptPath);
  return { modules: true, scriptPath, modulesRoot: config.WORKERS_DIR } as const;
}

/** Everything the platform Workers share: where Supabase is (publicly) and how to reach it. */
function platformBindings(config: DesktopConfig): Bindings {
  return {
    PORTAL_URL: config.portalUrl,
    SUPABASE_URL: config.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: config.SUPABASE_PUBLISHABLE_KEY,
  };
}

/** The `ASSETS` binding of one Worker: its folder in the shared store, with its not-found handling. */
function shim(name: string, prefix: string, fallback: 'spa' | '404') {
  return {
    name: `shim-${name}`,
    modules: true,
    script: ASSET_SHIM_SCRIPT,
    compatibilityDate: COMPATIBILITY_DATE,
    serviceBindings: { STORE: 'assets' },
    bindings: { PREFIX: prefix, FALLBACK: fallback },
  } as const;
}

export function miniflareOptions(config: DesktopConfig, apps: InstalledApp[]): MiniflareOptions {
  const common = {
    compatibilityDate: COMPATIBILITY_DATE,
    compatibilityFlags: ['nodejs_compat'],
    outboundService: 'supabase',
  };
  const serviceBindings: Record<string, string> = {
    PORTAL: 'portal',
    API: 'api',
    AI: 'ai',
    SUPABASE: 'supabase',
  };
  for (const app of apps) serviceBindings[bindingName(app.slug)] = `app-${app.slug}`;

  return {
    host: config.LISTEN_HOST,
    port: config.LISTEN_PORT,
    // Workers are written against Cloudflare's runtime: keep its caches in memory only.
    cachePersist: false,
    workers: [
      {
        name: 'router',
        modules: true,
        script: ROUTER_SCRIPT,
        compatibilityDate: COMPATIBILITY_DATE,
        serviceBindings,
        bindings: { DOMAIN: config.MININODE_DOMAIN },
      },
      {
        name: 'assets',
        modules: true,
        script: ASSET_STORE_SCRIPT,
        compatibilityDate: COMPATIBILITY_DATE,
        assets: {
          workerName: 'assets',
          directory: join(config.DATA_DIR, 'served'),
          binding: 'ASSETS',
          assetConfig: { not_found_handling: 'none' },
        },
      },
      shim('portal', '_portal', 'spa'),
      ...apps.map((app) => shim(app.slug, app.slug, app.kind === 'static' ? '404' : 'spa')),
      {
        name: 'supabase',
        modules: true,
        script: SUPABASE_PROXY_SCRIPT,
        compatibilityDate: COMPATIBILITY_DATE,
        bindings: {
          GATEWAY_URL: config.GATEWAY_URL,
          SUPABASE_HOST: `supabase.${config.MININODE_DOMAIN}`,
        },
      },
      {
        name: 'portal',
        ...common,
        ...bundled(config, 'portal'),
        serviceBindings: { ASSETS: 'shim-portal' },
        bindings: {
          ...platformBindings(config),
          API_URL: config.apiUrl,
          AI_URL: config.aiUrl,
          COOKIE_DOMAIN: `.${config.MININODE_DOMAIN}`,
          EMAIL_ENABLED: 'false',
        },
      },
      {
        name: 'api',
        ...common,
        ...bundled(config, 'api'),
        bindings: defined({
          ...platformBindings(config),
          MAIL_FROM: `hallo@${config.MININODE_DOMAIN}`,
          GITHUB_REPO: config.GITHUB_REPO,
          DEPLOY_ENVIRONMENT: 'production',
          // The Windows/Docker hardware server is a separate part; empty = not connected.
          GUACAMOLE_URL: '',
          NUCBOX_CONTROL_URL: '',
          SUPABASE_SECRET_KEY: config.SUPABASE_SECRET_KEY,
          GUACAMOLE_JSON_SECRET: config.GUACAMOLE_JSON_SECRET,
          NUCBOX_CONTROL_TOKEN: config.NUCBOX_CONTROL_TOKEN,
          VAULT_KEY: config.VAULT_KEY,
          GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: config.GOOGLE_CLIENT_SECRET,
          GOOGLE_TOKEN_KEY: config.GOOGLE_TOKEN_KEY,
          VAPID_PUBLIC_KEY: config.VAPID_PUBLIC_KEY,
          VAPID_PRIVATE_KEY: config.VAPID_PRIVATE_KEY,
        }),
      },
      {
        name: 'ai',
        ...common,
        ...bundled(config, 'ai'),
        bindings: defined({
          ...platformBindings(config),
          SUPABASE_SECRET_KEY: config.SUPABASE_SECRET_KEY,
          ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
          GEMINI_API_KEY: config.GEMINI_API_KEY,
          AI_GATEWAY_BASE: '',
          MODEL_CATALOG: '',
        }),
      },
      ...apps.map((app) => ({
        name: `app-${app.slug}`,
        ...common,
        ...bundled(config, 'gate'),
        serviceBindings: { ASSETS: `shim-${app.slug}` },
        bindings: {
          ...platformBindings(config),
          APP_SLUG: app.slug,
          APP_NAME: app.name,
          CONNECT_SRC: app.connectSrc,
          WASM: app.wasm ? '1' : '',
        },
      })),
    ],
  };
}
