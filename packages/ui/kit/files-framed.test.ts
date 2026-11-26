// files.js inside the installed portal's app viewer (ADR 0032): the app is a cross-origin frame,
// where Chromium refuses the file pickers, so the file field and downloads take their place.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

type Writable = { write(data: unknown): Promise<void>; close(): Promise<void> };
type Handle = { name: string; createWritable(): Promise<Writable> };
type Win = Window & {
  mininode: { mininode(): Promise<unknown> };
  showOpenFilePicker?: (options?: object) => Promise<unknown>;
  showSaveFilePicker(options?: object): Promise<Handle>;
};
const win = window as unknown as Win;
const nativeOpen = vi.fn();
const nativeSave = vi.fn();
const nativeAnchorClick = vi.fn();

beforeAll(() => {
  HTMLAnchorElement.prototype.click = nativeAnchorClick;
  win.showOpenFilePicker = nativeOpen;
  win.showSaveFilePicker = nativeSave;
  vi.stubGlobal('top', {});
  win.mininode = {
    mininode: async () => ({
      auth: { user: async () => ({ id: 'u1' }) },
      files: { list: async () => [], url: async () => '', upload: vi.fn() },
    }),
  };
  for (const file of ['ui.js', 'files.js']) {
    new Function(readFileSync(join(import.meta.dirname, file), 'utf8'))();
  }
});

const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.mn-sheet button')].find(
    (b) => b.textContent === text,
  );

describe('files.js in a frame', () => {
  it('takes the open picker away, so apps use the file field', () => {
    expect(win.showOpenFilePicker).toBeUndefined();
  });

  it('saves to the device as a download, never through the native picker', async () => {
    const picked = win.showSaveFilePicker({ suggestedName: 'Partitur.mscz' });
    for (let i = 0; i < 50 && !button('Auf diesem Gerät speichern'); i++)
      await new Promise((r) => setTimeout(r, 5));
    button('Auf diesem Gerät speichern')?.click();
    const handle = await picked;
    const writable = await handle.createWritable();
    await writable.write(new Uint8Array([1, 2]));
    await writable.close();
    expect(nativeSave).not.toHaveBeenCalled();
    expect(nativeAnchorClick).toHaveBeenCalled();
  });
});
