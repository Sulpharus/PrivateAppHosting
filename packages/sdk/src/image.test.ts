import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MininodeConfig } from './config.ts';
import { createImage } from './image.ts';

const config = { apiUrl: 'https://api.example.org/' } as MininodeConfig;
afterEach(() => vi.restoreAllMocks());

describe('mn.image', () => {
  it('asks the API for the picture with the session and returns its bytes', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } });
    });
    const blob = await createImage(
      config,
      async () => 'session',
    )('https://shop.de/a b.png?x=1&y=2');
    expect(blob.size).toBe(3);
    expect(calls[0]?.url).toBe(
      'https://api.example.org/image?url=https%3A%2F%2Fshop.de%2Fa%20b.png%3Fx%3D1%26y%3D2',
    );
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer session');
    expect(calls[0]?.init?.credentials).toBe('omit');
  });

  it("throws with the server's message, and without a session before asking", async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ message: 'Das Bild ist zu groß.' }, { status: 413 }));
    await expect(
      createImage(config, async () => 'session')('https://shop.de/a.png'),
    ).rejects.toThrow('Das Bild ist zu groß.');
    spy.mockClear();
    await expect(createImage(config, async () => null)('https://shop.de/a.png')).rejects.toThrow(
      'not signed in',
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
