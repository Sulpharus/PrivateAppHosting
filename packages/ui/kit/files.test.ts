// MiniNode files for apps that open and save the browser way (files.js): the dialog that offers
// the stored files and saving to MiniNode next to the device.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

type Writable = { write(data: unknown): Promise<void>; close(): Promise<void> };
type Handle = { name: string; createWritable(): Promise<Writable> };
type Win = Window & {
  mininode: { mininode(): Promise<unknown> };
  showSaveFilePicker(options?: object): Promise<Handle>;
};
const win = window as unknown as Win;

const upload = vi.fn(async (path: string) => path);
const stored = ['Brief.docx', 'Foto.png', 'Ordner'];
const nativeInputClick = vi.fn();
const nativeAnchorClick = vi.fn();

beforeAll(() => {
  HTMLInputElement.prototype.click = nativeInputClick;
  HTMLAnchorElement.prototype.click = nativeAnchorClick;
  win.mininode = {
    mininode: async () => ({
      files: {
        list: async () => stored,
        url: async (path: string) => `https://storage.test/${path}`,
        upload,
      },
    }),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) => new Response(new Blob([`body of ${url}`], { type: 'text/plain' })),
    ),
  );
  for (const file of ['ui.js', 'files.js']) {
    new Function(readFileSync(join(import.meta.dirname, file), 'utf8'))();
  }
});
afterEach(() => {
  window.mnui.sheet.close();
  document.body.innerHTML = '';
  upload.mockClear();
  nativeInputClick.mockClear();
  nativeAnchorClick.mockClear();
});

const sheet = () => document.querySelector<HTMLElement>('.mn-sheet');
const buttonNamed = (text: string | RegExp) =>
  [...(sheet()?.querySelectorAll('button') ?? [])].find((b) =>
    typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? ''),
  );
const until = async (check: () => unknown) => {
  for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(check()).toBeTruthy();
};

declare global {
  interface Window {
    mnui: { sheet: { close(): void } };
  }
}

describe('opening', () => {
  it('lists the stored files the field accepts and hands the chosen one to the app', async () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.docx' });
    const changed = vi.fn();
    input.addEventListener('change', changed);
    document.body.append(input);
    input.click();
    await until(() => buttonNamed(/Brief\.docx/));
    expect(buttonNamed(/Foto\.png/)).toBeUndefined();
    expect(buttonNamed(/Ordner/)).toBeUndefined();
    buttonNamed(/Brief\.docx/)?.click();
    await until(() => changed.mock.calls.length);
    expect(input.files?.[0]?.name).toBe('Brief.docx');
    expect(await input.files?.[0]?.text()).toBe('body of https://storage.test/Brief.docx');
    expect(nativeInputClick).not.toHaveBeenCalled();
  });

  it('opens the browser picker for files from the device', async () => {
    const input = Object.assign(document.createElement('input'), { type: 'file' });
    document.body.append(input);
    input.click();
    await until(() => buttonNamed('Von diesem Gerät …'));
    buttonNamed('Von diesem Gerät …')?.click();
    await until(() => nativeInputClick.mock.calls.length);
    expect(nativeInputClick.mock.contexts[0]).toBe(input);
  });

  it('leaves fields marked data-mn-native and other inputs alone', () => {
    const wrapper = Object.assign(document.createElement('div'), {
      innerHTML: '<input type="file">',
    });
    wrapper.dataset.mnNative = '';
    document.body.append(wrapper);
    wrapper.querySelector('input')?.click();
    const text = document.createElement('input');
    text.click();
    expect(nativeInputClick).toHaveBeenCalledTimes(2);
    expect(sheet()).toBeNull();
  });
});

describe('saving', () => {
  it('stores what the app writes to a save-picker handle in MiniNode', async () => {
    const picked = win.showSaveFilePicker({ suggestedName: 'Entwurf.docx' });
    await until(() => buttonNamed('In MiniNode speichern'));
    const name = sheet()?.querySelector('input');
    if (name) name.value = 'Neu.docx';
    buttonNamed('In MiniNode speichern')?.click();
    const handle = await picked;
    expect(handle.name).toBe('Neu.docx');
    const writable = await handle.createWritable();
    await writable.write(new Uint8Array([104, 105]));
    await writable.close();
    expect(upload).toHaveBeenCalledWith('Neu.docx', expect.any(Blob), expect.anything());
    expect(await (upload.mock.calls[0] as unknown as [string, Blob])[1].text()).toBe('hi');
  });

  it('hands the save picker a MiniNode handle without the dialog for a saved name', async () => {
    const first = win.showSaveFilePicker({ suggestedName: 'Bericht.docx' });
    await until(() => buttonNamed('In MiniNode speichern'));
    buttonNamed('In MiniNode speichern')?.click();
    const written = await (await first).createWritable();
    await written.close();
    await until(() => upload.mock.calls.length === 1);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 60_000);
      const handle = await win.showSaveFilePicker({ suggestedName: 'Bericht.docx' });
      expect(sheet()).toBeNull();
      const again = await handle.createWritable();
      await again.write(new Uint8Array([111, 107]));
      await again.close();
      await until(() => upload.mock.calls.length === 2);
      expect(upload.mock.calls[1]?.[0]).toBe('Bericht.docx');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with AbortError when the person cancels', async () => {
    const picked = win.showSaveFilePicker({ suggestedName: 'Entwurf.docx' });
    await until(() => buttonNamed('Abbrechen'));
    buttonNamed('Abbrechen')?.click();
    await expect(picked).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('stores a download link in MiniNode instead of downloading it', async () => {
    const link = Object.assign(document.createElement('a'), {
      href: 'blob:https://app.test/1',
      download: 'Export.pdf',
    });
    link.click();
    await until(() => buttonNamed('In MiniNode speichern'));
    buttonNamed('In MiniNode speichern')?.click();
    await until(() => upload.mock.calls.length);
    expect(upload.mock.calls[0]?.[0]).toBe('Export.pdf');
    expect(nativeAnchorClick).not.toHaveBeenCalled();
  });

  it('saves a file opened from MiniNode straight back, with "save as" in the toast', async () => {
    const input = Object.assign(document.createElement('input'), { type: 'file' });
    document.body.append(input);
    input.click();
    await until(() => buttonNamed(/Brief\.docx/));
    buttonNamed(/Brief\.docx/)?.click();
    await until(() => input.files?.length);
    const link = Object.assign(document.createElement('a'), {
      href: 'blob:https://app.test/2',
      download: 'Brief.docx',
    });
    link.click();
    await until(() => upload.mock.calls.length);
    expect(sheet()).toBeNull();
    expect(upload.mock.calls[0]?.[0]).toBe('Brief.docx');
    // The app's type is loose; the stored file is labelled by its name.
    expect(upload.mock.calls[0]?.[2]).toEqual({
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const saveAs = await vi.waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>('.mn-toast-action');
      if (!button) throw new Error('no toast action yet');
      return button;
    });
    expect(saveAs.textContent).toBe('Speichern unter …');
    saveAs.click();
    await until(() => buttonNamed('In MiniNode speichern'));
    expect(sheet()?.querySelector('input')?.value).toBe('Brief.docx');
  });

  const downloadOf = (name: string) =>
    Object.assign(document.createElement('a'), { href: 'blob:https://app.test/3', download: name });

  it('saves again without a dialog after saving to MiniNode, and asks on a quick second save', async () => {
    downloadOf('Plan.pdf').click();
    await until(() => buttonNamed('In MiniNode speichern'));
    buttonNamed('In MiniNode speichern')?.click();
    await until(() => upload.mock.calls.length === 1);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 60_000);
      downloadOf('Plan.pdf').click();
      await until(() => upload.mock.calls.length === 2);
      expect(sheet()).toBeNull();
      // Ctrl+S twice: the second one is the way to the dialog without the pointer.
      downloadOf('Plan.pdf').click();
      await until(() => buttonNamed('In MiniNode speichern'));
      expect(upload).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks again once a file of that name came from the device', async () => {
    downloadOf('Notiz.txt').click();
    await until(() => buttonNamed('In MiniNode speichern'));
    buttonNamed('In MiniNode speichern')?.click();
    await until(() => upload.mock.calls.length === 1);
    const input = Object.assign(document.createElement('input'), { type: 'file' });
    document.body.append(input);
    input.click();
    await until(() => buttonNamed('Von diesem Gerät …'));
    buttonNamed('Von diesem Gerät …')?.click();
    await until(() => nativeInputClick.mock.calls.length);
    const transfer = new DataTransfer();
    transfer.items.add(new File(['x'], 'Notiz.txt'));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    downloadOf('Notiz.txt').click();
    await until(() => buttonNamed('In MiniNode speichern'));
    expect(upload).toHaveBeenCalledOnce();
  });

  it('lets ordinary links through', () => {
    const link = Object.assign(document.createElement('a'), { href: 'https://example.com/' });
    link.click();
    expect(nativeAnchorClick).toHaveBeenCalledOnce();
    expect(sheet()).toBeNull();
  });
});
