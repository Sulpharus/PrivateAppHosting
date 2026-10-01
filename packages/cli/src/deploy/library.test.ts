import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkLibraryInstall, installLibraryApp, removeLibraryApp } from './library.ts';

interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** A PostgREST double: `existing` is the apps row the slug lookup returns (or none). */
function fakeFetch(existing: { slug: string; manifest: unknown; status?: string } | null) {
  const calls: Call[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    if (url.includes('/profiles')) return Response.json({ user_id: 'admin-1' });
    if (url.includes('/apps') && method === 'GET') {
      // maybeSingle() asks for one object; an empty result is a 406 with PGRST116 or null.
      return existing ? Response.json(existing) : Response.json(null);
    }
    return new Response(null, { status: 204 });
  };
  return { fn: fn as typeof fetch, calls };
}

const env = { ...process.env };
beforeEach(() => {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://db.example.com',
    SUPABASE_PUBLISHABLE_KEY: 'pub',
    SUPABASE_SECRET_KEY: 'secret',
  });
});
afterEach(() => {
  process.env = { ...env };
});

const writes = (calls: Call[]) =>
  calls
    .filter((c) => c.method !== 'GET')
    .map((c) => `${c.method} ${new URL(c.url).pathname.split('/').pop()}`);

describe('App-Bibliothek CLI', () => {
  it('checks entry and address before a rollout', async () => {
    await expect(
      checkLibraryInstall('production', 'jellyfin', 'kino', { fetch: fakeFetch(null).fn }),
    ).resolves.toBeUndefined();
    await expect(
      checkLibraryInstall('production', 'nope', 'kino', { fetch: fakeFetch(null).fn }),
    ).rejects.toThrow('unknown library entry');
    await expect(
      checkLibraryInstall('production', 'jellyfin', 'api', { fetch: fakeFetch(null).fn }),
    ).rejects.toThrow('invalid slug');
    const taken = fakeFetch({ slug: 'kino', manifest: { slug: 'kino' } });
    await expect(
      checkLibraryInstall('production', 'jellyfin', 'kino', { fetch: taken.fn }),
    ).rejects.toThrow('already taken');
    // Updating the same program at its address is fine.
    const same = fakeFetch({ slug: 'kino', manifest: { library: 'jellyfin' } });
    await expect(
      checkLibraryInstall('production', 'jellyfin', 'kino', { fetch: same.fn }),
    ).resolves.toBeUndefined();
  });

  it('registers a container app with the library marker and brings it back online', async () => {
    const { fn, calls } = fakeFetch(null);
    await installLibraryApp('production', 'jellyfin', 'kino', 'abc1234', { fetch: fn });
    const upsert = calls.find((c) => c.method === 'POST' && c.url.includes('/apps'));
    expect(upsert?.body).toMatchObject({
      slug: 'kino',
      kind: 'container',
      target: 'nucbox',
      manifest: { library: 'jellyfin', container: { port: 8096 } },
    });
    const origins = calls.find((c) => c.url.includes('/app_origins'));
    expect(origins?.body).toEqual([{ origin: 'https://kino.mininode.app', app_slug: 'kino' }]);
    const enable = calls.find((c) => c.method === 'PATCH' && c.url.includes('/apps'));
    expect(enable?.body).toEqual({ status: 'online' });
  });

  it('refuses to register over another app', async () => {
    const { fn, calls } = fakeFetch({ slug: 'kino', manifest: { library: 'n8n' } });
    await expect(
      installLibraryApp('production', 'jellyfin', 'kino', 'v', { fetch: fn }),
    ).rejects.toThrow('already taken');
    expect(writes(calls)).toEqual([]);
  });

  it('disables only the program it was asked to remove', async () => {
    const right = fakeFetch({ slug: 'kino', manifest: { library: 'jellyfin' } });
    await removeLibraryApp('production', 'kino', 'jellyfin', { fetch: right.fn });
    expect(right.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'disabled' });

    const hosted = fakeFetch({ slug: 'kino', manifest: { slug: 'kino' } });
    await expect(
      removeLibraryApp('production', 'kino', 'jellyfin', { fetch: hosted.fn }),
    ).rejects.toThrow('is not jellyfin');
    expect(writes(hosted.calls)).toEqual([]);

    const gone = fakeFetch(null);
    await removeLibraryApp('production', 'kino', 'jellyfin', { fetch: gone.fn });
    expect(writes(gone.calls)).toEqual([]);
  });
});
