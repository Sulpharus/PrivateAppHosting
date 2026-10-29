// Plain JS: the gate's tsconfig has Workers types only, and this test needs Node.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// sw.js (served as /_mininode/sw.js) is the service worker of every hosted app.
const script = readFileSync(join(import.meta.dirname, '../assets/sw.js'), 'utf8');

/** Runs sw.js against a fake worker scope and returns its fetch handler. */
function fetchHandler() {
  const listeners = {};
  const self = {
    location: { origin: 'https://app.example.org' },
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
  };
  new Function('self', 'caches', 'fetch', script)(self, {}, () => new Promise(() => {}));
  return listeners.fetch;
}

const event = (path, mode = 'cors') => ({
  request: { method: 'GET', mode, url: `https://app.example.org${path}` },
  respondWith: vi.fn(),
});

describe('sw.js', () => {
  it('leaves WebAssembly modules to the network and the HTTP cache', () => {
    const handle = fetchHandler();
    for (const path of ['/app-6020ded28f149c6b_bg.wasm', '/filmcraft_web_bg.wasm']) {
      const wasm = event(path);
      handle(wasm);
      expect(wasm.respondWith).not.toHaveBeenCalled();
    }
  });

  it('still answers scripts and pages', () => {
    const handle = fetchHandler();
    const script = event('/boot-1.js');
    handle(script);
    expect(script.respondWith).toHaveBeenCalledOnce();
  });
});
