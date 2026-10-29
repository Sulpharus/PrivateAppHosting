import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type InstanceConfig,
  type ResolvedEnvironment,
  resolveEnvironment,
} from '@mininode/manifest';

/** Replaces the one `"key": "value"` pair of a JSONC file; fails when the key is not unique. */
export function setJsonString(text: string, key: string, value: string): string {
  const pattern = new RegExp(`("${key}"\\s*:\\s*")[^"\\n]*(")`, 'g');
  const matches = text.match(pattern);
  if (matches?.length !== 1) {
    throw new Error(
      `expected exactly one "${key}" in the wrangler file, found ${matches?.length ?? 0}`,
    );
  }
  return text.replace(pattern, (_all, open: string, close: string) => `${open}${value}${close}`);
}

/** Replaces `key = …` inside one TOML table (up to the next table header). */
export function setTomlValue(text: string, table: string, key: string, literal: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `[${table}]`);
  if (start < 0) throw new Error(`supabase/config.toml has no [${table}]`);
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('[')) break;
    if (new RegExp(`^${key}\\s*=`).test(line)) {
      lines[i] = `${key} = ${literal}`;
      return lines.join('\n');
    }
  }
  throw new Error(`supabase/config.toml has no ${key} in [${table}]`);
}

const STAGING_BEGIN = '# mininode:staging-begin';
const STAGING_END = '# mininode:staging-end';

function renderWorker(text: string, env: ResolvedEnvironment, vars: Record<string, string>) {
  let out = setJsonString(text, 'account_id', env.cloudflareAccountId);
  for (const [key, value] of Object.entries(vars)) out = setJsonString(out, key, value);
  return out;
}

export function renderPortal(text: string, env: ResolvedEnvironment): string {
  return renderWorker(text, env, {
    pattern: env.domain,
    SUPABASE_URL: env.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: env.supabasePublishableKey,
    API_URL: env.apiUrl,
    AI_URL: env.aiUrl,
    COOKIE_DOMAIN: `.${env.domain}`,
  });
}

export function renderApi(text: string, env: ResolvedEnvironment, repository = ''): string {
  return renderWorker(text, env, {
    pattern: `api.${env.domain}`,
    PORTAL_URL: env.portalUrl,
    SUPABASE_URL: env.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: env.supabasePublishableKey,
    MAIL_FROM: env.mailFrom,
    GITHUB_REPO: repository,
    GUACAMOLE_URL: `https://remote.${env.domain}`,
    NUCBOX_CONTROL_URL: `https://control.${env.domain}`,
  });
}

export function renderAiProxy(text: string, env: ResolvedEnvironment): string {
  return renderWorker(text, env, {
    pattern: `ai.${env.domain}`,
    PORTAL_URL: env.portalUrl,
    SUPABASE_URL: env.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: env.supabasePublishableKey,
    AI_GATEWAY_BASE: `https://gateway.ai.cloudflare.com/v1/${env.cloudflareAccountId}/mininode`,
  });
}

export function renderSupabaseConfig(text: string, config: InstanceConfig): string {
  const production = resolveEnvironment(config, 'production');
  let out = setTomlValue(
    text,
    'remotes.production',
    'project_id',
    `"${production.supabaseProjectRef}"`,
  );
  out = setTomlValue(out, 'remotes.production.auth', 'site_url', `"${production.portalUrl}"`);
  out = setTomlValue(
    out,
    'remotes.production.auth',
    'additional_redirect_urls',
    `["${production.portalUrl}/**", "https://*.${production.domain}/**"]`,
  );
  out = setTomlValue(out, 'remotes.production.auth.webauthn', 'rp_id', `"${production.domain}"`);
  out = setTomlValue(
    out,
    'remotes.production.auth.webauthn',
    'rp_origins',
    `["${production.portalUrl}"]`,
  );
  const begin = out.indexOf(STAGING_BEGIN);
  const end = out.indexOf(STAGING_END);
  if (begin < 0 || end < begin) throw new Error('supabase/config.toml lost its staging markers');
  const staging = config.environments.staging
    ? `[remotes.staging]\nproject_id = "${config.environments.staging.supabase.projectRef}"\n`
    : '';
  return `${out.slice(0, begin + STAGING_BEGIN.length)}\n${staging}${out.slice(end)}`;
}

interface Target {
  path: string;
  render: (text: string, config: InstanceConfig) => string;
}

const TARGETS: Target[] = [
  { path: 'apps/portal/wrangler.jsonc', render: (t, c) => renderPortal(t, resolveEnvironment(c)) },
  {
    path: 'apps/api/wrangler.jsonc',
    render: (t, c) => renderApi(t, resolveEnvironment(c), c.github?.repository),
  },
  {
    path: 'apps/ai-proxy/wrangler.jsonc',
    render: (t, c) => renderAiProxy(t, resolveEnvironment(c)),
  },
  { path: 'supabase/config.toml', render: renderSupabaseConfig },
];

export interface ConfigureResult {
  changed: string[];
}

/** Writes the configuration into the files that cannot read it at run time. */
export function configureInstance(
  root: string,
  config: InstanceConfig,
  options: { check?: boolean } = {},
): ConfigureResult {
  const changed: string[] = [];
  for (const target of TARGETS) {
    const path = join(root, target.path);
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const after = target.render(before, config);
    if (after === before) continue;
    changed.push(target.path);
    if (!options.check) writeFileSync(path, after);
  }
  return { changed };
}

/** `KEY=value` lines for `$GITHUB_ENV` and shell scripts; the workflows' view of the config. */
export function environmentVariables(
  config: InstanceConfig,
  name: 'production' | 'staging',
): Record<string, string> {
  const environment = config.environments[name];
  if (!environment) throw new Error(`mininode.config.json has no "${name}" environment`);
  const { projectRef, publishableKey } = environment.supabase;
  return {
    ...(environment.domain ? { MININODE_DOMAIN: environment.domain } : {}),
    MININODE_ZONE: config.zone ?? environment.domain ?? '',
    CLOUDFLARE_ACCOUNT_ID: config.cloudflare.accountId,
    SUPABASE_PROJECT_REF: projectRef,
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  };
}
