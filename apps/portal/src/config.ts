export interface PortalConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  apiUrl: string;
  aiUrl: string;
  cookieDomain?: string | undefined;
  /** False until Cloudflare Email Sending is set up: password resets go through the admin. */
  emailEnabled?: boolean | undefined;
}

/** Dev reads Vite env vars; production reads `/config.json` served by the portal Worker. */
export async function loadConfig(): Promise<PortalConfig> {
  if (import.meta.env.DEV) {
    const env = import.meta.env;
    return {
      supabaseUrl: env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      supabasePublishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      apiUrl: env.VITE_API_URL ?? 'http://localhost:8787',
      aiUrl: env.VITE_AI_URL ?? 'http://localhost:8788',
    };
  }
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`config.json: ${response.status}`);
  return (await response.json()) as PortalConfig;
}

let current: PortalConfig | undefined;

/** Called once at startup; lets components read feature flags without prop drilling. */
export function setRuntimeConfig(config: PortalConfig): void {
  current = config;
}

export function emailEnabled(): boolean {
  return current?.emailEnabled === true;
}
