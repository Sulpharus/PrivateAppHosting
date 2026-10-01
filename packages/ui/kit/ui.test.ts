// Behaviour of the kit helpers (ui.js) in a DOM: dialogs, selection, theme and date fields.
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
  date: { format(value: string | Date): string; months: string[] };
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

describe('German dates', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const field = async (html: string) => {
    const form = document.createElement('form');
    form.innerHTML = html;
    document.body.append(form);
    await tick();
    return form;
  };

  it('formats full dates and months as day, abbreviated month and year', () => {
    expect(mnui.date.format('2026-10-01')).toBe('01. Okt. 2026');
    expect(mnui.date.format('2026-05-09')).toBe('09. Mai 2026');
    expect(mnui.date.format('2026-09')).toBe('Sept. 2026');
    expect(mnui.date.format(new Date(2026, 2, 3))).toBe('03. März 2026');
    expect(mnui.date.format('kein Datum')).toBe('');
  });

  it('shows a date input as Tag · Monat · Jahr and keeps its ISO value and events', async () => {
    const form = await field(
      '<label>Beginn<input type="date" name="d" value="2026-10-01"></label>',
    );
    const input = form.querySelector('input[name=d]') as HTMLInputElement;
    const [day, month] = [...form.querySelectorAll('select')] as HTMLSelectElement[];
    const year = form.querySelector('.mn-date-jahr') as HTMLInputElement;
    expect([day.value, month.options[month.selectedIndex]?.textContent, year.value]).toEqual([
      '01',
      'Okt.',
      '2026',
    ]);
    expect(input.getAttribute('aria-label')).toBe('Beginn');
    expect(input.tabIndex).toBe(-1);

    const changes: string[] = [];
    input.addEventListener('change', () => changes.push(input.value));
    month.value = '02';
    day.value = '31';
    month.dispatchEvent(new Event('change', { bubbles: true }));
    // 31 February becomes the last day of February.
    expect(input.value).toBe('2026-02-28');
    expect(day.value).toBe('28');
    expect(changes).toEqual(['2026-02-28']);
    expect(new FormData(form).get('d')).toBe('2026-02-28');

    // Code that sets the value updates the visible parts.
    input.value = '2030-12-24';
    expect([day.value, month.value, year.value]).toEqual(['24', '12', '2030']);
  });

  it('shows a month input as Monat · Jahr', async () => {
    const form = await field('<label>Erste Buchung<input type="month" name="m"></label>');
    const input = form.querySelector('input[name=m]') as HTMLInputElement;
    expect(form.querySelectorAll('select')).toHaveLength(1);
    const month = form.querySelector('select') as HTMLSelectElement;
    month.value = '10';
    month.dispatchEvent(new Event('change', { bubbles: true }));
    // A month without a year takes the current year.
    expect((form.querySelector('.mn-date-jahr') as HTMLInputElement).value).toBe(
      String(new Date().getFullYear()),
    );
    expect(input.value).toBe(`${new Date().getFullYear()}-10`);
  });

  it('shows a time input as Stunde : Minute in 24 hours, following its step', async () => {
    const form = await field(
      '<label>Uhrzeit<input type="time" name="t" step="300" value="18:30"></label>',
    );
    const input = form.querySelector('input[name=t]') as HTMLInputElement;
    const [hour, minute] = [...form.querySelectorAll('select')] as HTMLSelectElement[];
    expect([hour.value, minute.value]).toEqual(['18', '30']);
    expect([...minute.options].map((o) => o.value)).toContain('55');
    expect([...minute.options].map((o) => o.value)).not.toContain('31');
    hour.value = '07';
    hour.dispatchEvent(new Event('change', { bubbles: true }));
    expect(input.value).toBe('07:30');
  });

  it('leaves inputs marked data-mn-native alone', async () => {
    const form = await field('<div data-mn-native><input type="date" name="n"></div>');
    expect(form.querySelector('.mn-date')).toBeNull();
  });
});
