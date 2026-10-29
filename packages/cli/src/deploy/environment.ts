// Deploy targets: production and staging share code but use separate Supabase projects,
// portal origins and Worker names. The domain and project of each come from
// mininode.config.json; the workflows export the same values (`mininode config env`).
import { resolve } from 'node:path';
import { publicOrigin } from '@mininode/manifest';
import { loadInstanceConfig } from '../instance/load.ts';

const ROOT = resolve(import.meta.dirname, '../../../..');

export type DeployEnv = 'production' | 'staging' | 'local' | 'desktop';

export interface EnvironmentSettings {
  name: DeployEnv;
  domain: string;
  portalUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  workerPrefix: string;
}

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (!value) throw new Error(`missing environment variable ${name}`);
  return value;
}

function configuredDomain(name: 'production' | 'staging'): string {
  const domain = loadInstanceConfig(ROOT).environments[name]?.domain;
  if (!domain) throw new Error(`no domain for ${name}: set it in mininode.config.json`);
  return domain;
}

export function environmentSettings(
  name: DeployEnv,
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentSettings {
  if (name === 'local') {
    return {
      name,
      domain: 'localhost',
      portalUrl: 'http://localhost:5173',
      supabaseUrl: env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
      supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY', env),
      workerPrefix: 'mn-local-',
    };
  }
  if (name === 'desktop') {
    // The desktop installation is configured by its .env (see infra/desktop), not by mininode.config.json.
    const domain = required('MININODE_DOMAIN', env);
    const scheme = env.MININODE_SCHEME === 'https' ? 'https' : 'http';
    const port = Number(env.MININODE_PORT ?? 8787);
    return {
      name,
      domain,
      portalUrl: publicOrigin({ domain, scheme, port }),
      supabaseUrl: required('SUPABASE_URL', env),
      supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY', env),
      workerPrefix: 'mn-desktop-',
    };
  }
  const domain =
    env.MININODE_DOMAIN ??
    (name === 'staging' ? env.STAGING_DOMAIN : undefined) ??
    configuredDomain(name);
  return {
    name,
    domain,
    portalUrl: `https://${domain}`,
    supabaseUrl: required('SUPABASE_URL', env),
    supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY', env),
    workerPrefix: name === 'production' ? 'mn-app-' : 'mn-stg-',
  };
}
