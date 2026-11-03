// The SoundFont for playback (MuseScore's own "MS Basic", MIT licence, about 49 MiB). One
// Cloudflare asset may be at most 25 MiB, so build.mjs splits it into parts named after its
// content. They load in the background once the editor runs and stay in this browser's Cache
// Storage, so later starts read them from disk. The editor gets one blob: address for the whole file.

const CACHE = 'musescore-soundfont';

async function part(cache, url) {
  const cached = cache && (await cache.match(url));
  if (cached) return cached.blob();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  if (cache) await cache.put(url, response.clone());
  return response.blob();
}

/** @param {{ parts: string[] }} options */
export async function soundFontUrl(options) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    // Parts of an older SoundFont build are no longer needed.
    const wanted = new Set(options.parts.map((name) => new URL(name, import.meta.url).href));
    for (const request of await cache.keys()) {
      if (!wanted.has(request.url)) await cache.delete(request);
    }
  } catch {
    cache = null; // no Cache Storage (private window): the HTTP cache still helps
  }
  const blobs = [];
  for (const name of options.parts)
    blobs.push(await part(cache, new URL(name, import.meta.url).href));
  return URL.createObjectURL(new Blob(blobs, { type: 'application/octet-stream' }));
}
