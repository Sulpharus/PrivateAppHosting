// Test stand-in for /_mininode/sdk.js: a signed-in person, files and kv in memory (window.__mnFiles).
(() => {
  const files = new Map();
  window.__mnFiles = files;
  // Test seed: [[path, base64], …] set by the smoke test before the page loads.
  for (const [path, b64] of window.__mnSeed ?? []) {
    files.set(path, new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
  }
  const kv = new Map(window.__mnKvSeed ?? []);
  window.__mnKv = kv;
  const mn = {
    auth: { requireLogin: async () => ({ id: 'u1', user_metadata: { name: 'Test Person' } }) },
    files: {
      async upload(path, body) {
        files.set(path, body instanceof Blob ? body : new Blob([body]));
        return `musescore/u1/${path}`;
      },
      async url(path) {
        const blob = files.get(path);
        if (!blob) throw new Error(`not found: ${path}`);
        return URL.createObjectURL(blob);
      },
      async list(prefix = '') {
        const folder = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
        // Like Supabase Storage: the direct children, subfolders by their name.
        const names = new Set();
        for (const key of files.keys()) {
          if (key.startsWith(folder)) names.add(key.slice(folder.length).split('/')[0]);
        }
        return [...names];
      },
      async remove(path) {
        files.delete(path);
      },
    },
    kv: {
      async get(key) {
        return kv.has(key) ? structuredClone(kv.get(key)) : null;
      },
      async set(key, value) {
        kv.set(key, structuredClone(value));
      },
    },
  };
  window.mininode = { mininode: async () => mn, installLocalStorageSync: async () => {} };
})();
