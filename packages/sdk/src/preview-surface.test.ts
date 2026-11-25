// The preview SDK of the KI-Werkstatt starter package (packages/ui/kit/sdk-preview.js, ADR 0030)
// stands in for this client in a builder's preview. Code written against it must run unchanged on
// MiniNode, so it has the same methods in the same places as the real client.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMininode } from './index.ts';

const config = {
  appSlug: 'surface',
  appName: 'Surface',
  supabaseUrl: 'http://127.0.0.1:1',
  supabasePublishableKey: 'pk',
  portalUrl: 'http://localhost:5173',
  apiUrl: 'http://localhost:8787',
  aiUrl: 'http://localhost:8788',
};

/** Top-level keys, and the keys of every namespace object (not of the raw clients). */
function surface(client: Record<string, unknown>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(client)) {
    if (key === 'supabase' || key === 'db') continue;
    out[key] =
      typeof value === 'function'
        ? 'function'
        : Object.keys(value as object)
            .filter((k) => typeof (value as Record<string, unknown>)[k] !== 'undefined')
            .sort();
  }
  return out;
}

describe('the starter package preview SDK', () => {
  it('has the same surface as the real client', async () => {
    const real = createMininode(config) as unknown as Record<string, unknown>;
    const source = readFileSync(join(import.meta.dirname, '../../ui/kit/sdk-preview.js'), 'utf8');
    type Host = { mininode?: { mininode(): Promise<unknown> } };
    const host = () => window as unknown as Host;
    delete host().mininode;
    new Function(source)();
    const preview = (await host().mininode?.mininode()) as Record<string, unknown>;
    delete host().mininode;

    expect(surface(preview)).toEqual(surface(real));
    const realSuite = real.suite as { type(t: string): object };
    const previewSuite = preview.suite as { type(t: string): object };
    expect(Object.keys(previewSuite.type('event')).sort()).toEqual(
      Object.keys(realSuite.type('event')).sort(),
    );
    expect(Object.keys(preview.config as object).sort()).toEqual(
      Object.keys(real.config as object).sort(),
    );
  });
});
