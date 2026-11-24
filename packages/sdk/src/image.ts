import type { MininodeConfig } from './config.ts';

// Pictures from other sites (`mn.image`): the page's CSP and most shops' missing CORS headers keep
// the browser from reading them, so api.<domain> fetches them (`GET /image`, public https only).

type TokenSource = () => Promise<string | null>;

export function createImage(config: MininodeConfig, session: TokenSource) {
  return async (url: string): Promise<Blob> => {
    const token = await session();
    if (!token) throw new Error('mininode: not signed in');
    const response = await fetch(
      `${config.apiUrl.replace(/\/$/, '')}/image?url=${encodeURIComponent(url)}`,
      { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit' },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(`mininode: ${body.message ?? response.statusText}`);
    }
    return response.blob();
  };
}
