// Behaviour of the kit helpers (ui.js) in a DOM: dialogs, selection and theme.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Mnui {
  sheet: {
    open(
      content: Node | string,
      options?: { tall?: boolean; modal?: boolean; onClose?: () => void },
    ): HTMLElement;
    close(): void;
  };
  toast(message: string): void;
  theme: { get(): string; set(value: string): void };
  select(button: HTMLElement): void;
}

const source = readFileSync(join(import.meta.dirname, 'ui.js'), 'utf8');
let mnui: Mnui;

beforeEach(() => {
  document.body.innerHTML =
    '<button id="opener">Öffnen</button><main id="page"><a href="#x">Link</a></main>';
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  new Function(source)();
  mnui = (window as unknown as { mnui: Mnui }).mnui;
});

// Each test loads its own copy of ui.js; close its sheet so no key listener outlives the test.
afterEach(() => mnui.sheet.close());

const press = (key: string, shiftKey = false) =>
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
  );

describe('mnui.sheet', () => {
  const html = '<h2>Titel</h2><button id="a">A</button><button id="b">B</button>';

  it('labels the dialog, focuses it and makes the page inert', () => {
    const sheet = mnui.sheet.open(html);
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-labelledby')).toBe(sheet.querySelector('h2')?.id);
    expect(document.activeElement).toBe(sheet);
    expect((document.getElementById('page') as HTMLElement).inert).toBe(true);
  });

  it('closes on Escape, restores focus and calls onClose once', () => {
    const opener = document.getElementById('opener') as HTMLButtonElement;
    opener.focus();
    const onClose = vi.fn();
    mnui.sheet.open(html, { onClose });
    press('Escape');
    expect(document.querySelector('.mn-overlay')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect((document.getElementById('page') as HTMLElement).inert).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when used as an event handler', () => {
    const onClose = vi.fn();
    mnui.sheet.open(html, { onClose });
    (mnui.sheet.close as (e: unknown) => void)(new Event('click'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the previous sheet with its onClose when another opens', () => {
    const first = vi.fn();
    mnui.sheet.open(html, { onClose: first });
    mnui.sheet.open(html);
    expect(first).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.mn-overlay')).toHaveLength(1);
  });

  it('accepts nodes, so app data never needs to become HTML', () => {
    const title = document.createElement('h2');
    title.textContent = '<img src=x onerror=alert(1)>';
    const sheet = mnui.sheet.open(title);
    expect(sheet.querySelector('img')).toBeNull();
    expect(sheet.textContent).toContain('<img');
  });

  it('keeps Tab inside the sheet', () => {
    const sheet = mnui.sheet.open(html);
    const [a, b] = [sheet.querySelector('#a'), sheet.querySelector('#b')] as HTMLElement[];
    // happy-dom has no layout; treat every element as visible.
    for (const el of [a, b]) el.getClientRects = () => [{}] as unknown as DOMRectList;
    b.focus();
    press('Tab');
    expect(document.activeElement).toBe(a);
    press('Tab', true);
    expect(document.activeElement).toBe(b);
    (document.getElementById('opener') as HTMLElement).focus();
    press('Tab');
    expect(document.activeElement).toBe(a);
  });

  it('closes on the backdrop unless modal', () => {
    mnui.sheet.open(html, { modal: true });
    (document.querySelector('.mn-overlay') as HTMLElement).click();
    expect(document.querySelector('.mn-overlay')).not.toBeNull();
    mnui.sheet.open(html);
    (document.querySelector('.mn-overlay') as HTMLElement).click();
    expect(document.querySelector('.mn-overlay')).toBeNull();
  });
});

describe('mnui.select and mnui.theme', () => {
  it('uses aria-pressed in groups and aria-current in tabs', () => {
    document.body.innerHTML =
      '<div class="mn-seg"><button id="s1"></button><button id="s2"></button></div><div class="mn-tabs"><button id="t1"></button><button id="t2"></button></div>';
    mnui.select(document.getElementById('s2') as HTMLElement);
    expect(document.getElementById('s1')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById('s2')?.getAttribute('aria-pressed')).toBe('true');
    mnui.select(document.getElementById('t1') as HTMLElement);
    expect(document.getElementById('t1')?.getAttribute('aria-current')).toBe('page');
    expect(document.getElementById('t2')?.hasAttribute('aria-current')).toBe(false);
  });

  it('stores a forced theme and forgets it for system', () => {
    mnui.theme.set('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(mnui.theme.get()).toBe('dark');
    mnui.theme.set('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(mnui.theme.get()).toBe('system');
  });
});
