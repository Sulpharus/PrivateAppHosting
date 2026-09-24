/** Public runtime configuration served by the app's gate at `/_mininode/config.json`. */
export interface MininodeConfig {
  appSlug: string;
  appName: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  portalUrl: string;
  apiUrl: string;
  aiUrl: string;
  /** `.mininode.app` in production; undefined on localhost. */
  cookieDomain?: string;
}

const REQUIRED: (keyof MininodeConfig)[] = [
  'appSlug',
  'appName',
  'supabaseUrl',
  'supabasePublishableKey',
  'portalUrl',
  'apiUrl',
  'aiUrl',
];

export function assertConfig(value: unknown): MininodeConfig {
  if (typeof value !== 'object' || value === null) throw new Error('mininode: invalid config');
  const record = value as Record<string, unknown>;
  for (const key of REQUIRED) {
    if (typeof record[key] !== 'string' || record[key] === '') {
      throw new Error(`mininode: config is missing "${key}"`);
    }
  }
  return value as MininodeConfig;
}

export async function loadConfig(fetcher: typeof fetch = fetch): Promise<MininodeConfig> {
  const response = await fetcher('/_mininode/config.json', { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`mininode: could not load /_mininode/config.json (${response.status})`);
  }
  return assertConfig(await response.json());
}

export function appSchema(slug: string): string {
  return `app_${slug.replaceAll('-', '_')}`;
}
