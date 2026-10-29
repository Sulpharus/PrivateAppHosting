// The two small Workers that sit in front of the platform Workers on a desktop installation.
// They are plain JavaScript modules, run by the same workerd as the platform code.

/** Picks the Worker for a host name: the portal, api., ai., supabase. or an app's own address. */
export const ROUTER_SCRIPT = `
export default {
  async fetch(request, env) {
    const host = new URL(request.url).hostname.toLowerCase();
    const domain = env.DOMAIN;
    if (host === domain) return env.PORTAL.fetch(request);
    if (!host.endsWith('.' + domain)) return new Response('Unknown address.', { status: 404 });
    const sub = host.slice(0, -(domain.length + 1));
    if (sub === 'api') return env.API.fetch(request);
    if (sub === 'ai') return env.AI.fetch(request);
    if (sub === 'supabase') return env.SUPABASE.fetch(request);
    const app = env['APP_' + sub.replaceAll('-', '_').toUpperCase()];
    if (app && /^[a-z][a-z0-9-]*$/.test(sub)) return app.fetch(request);
    return new Response('Diese App gibt es nicht.', { status: 404 });
  },
};
`;

/**
 * Sends calls for supabase.<domain> to the Supabase gateway inside the Docker network. It is the
 * Worker behind that address for browsers, and the outbound service of the platform Workers, so
 * they reach Supabase by its public address without any DNS for it.
 */
export const SUPABASE_PROXY_SCRIPT = `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.toLowerCase() !== env.SUPABASE_HOST) return fetch(request);
    const gateway = new URL(env.GATEWAY_URL);
    url.protocol = gateway.protocol;
    url.host = gateway.host;
    return fetch(new Request(url, request), { redirect: 'manual' });
  },
};
`;

/**
 * Miniflare gives every Worker with `assets` the same file store, so one Worker holds all the files
 * (`served/_portal`, `served/<slug>`, …) and each app reaches only its own folder through a shim.
 */
export const ASSET_STORE_SCRIPT = `
export default { fetch: (request, env) => env.ASSETS.fetch(request) };
`;

/** What an app's (or the portal's) \`ASSETS\` binding is: its folder inside the shared store. */
export const ASSET_SHIM_SCRIPT = `
const wantsPage = (request) => {
  const mode = request.headers.get('Sec-Fetch-Mode');
  if (mode) return mode === 'navigate';
  return request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html');
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = '/' + env.PREFIX;
    const inStore = (path) => {
      const target = new URL(url);
      target.pathname = prefix + path;
      return new Request(target, request);
    };
    const unprefix = (response) => {
      const location = response.headers.get('Location');
      if (!location) return response;
      const target = new URL(location, url);
      if (target.pathname !== prefix && !target.pathname.startsWith(prefix + '/')) return response;
      target.pathname = target.pathname.slice(prefix.length) || '/';
      const next = new Response(response.body, response);
      next.headers.set('Location', target.pathname + target.search);
      return next;
    };
    // A path with ".." never leaves the app's folder: the store resolves it below the prefix only.
    if (url.pathname.split('/').some((part) => part === '..' || part === '%2e%2e')) {
      return new Response('Not found', { status: 404 });
    }
    let response = await env.STORE.fetch(inStore(url.pathname));
    if (response.status !== 404) return unprefix(response);
    if (env.FALLBACK === 'spa' && wantsPage(request)) {
      return unprefix(await env.STORE.fetch(inStore('/')));
    }
    if (env.FALLBACK === '404') {
      // "/404" is how the store names 404.html (it redirects the long form).
      const page = await env.STORE.fetch(inStore('/404'));
      if (page.ok) return new Response(page.body, { status: 404, headers: page.headers });
    }
    return response;
  },
};
`;
