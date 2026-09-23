export interface PortalConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  apiUrl: string;
  aiUrl: string;
  cookieDomain?: string | undefined;
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
