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

describe('English dates (kit/i18n.js found an English package)', () => {
  const english = () => {
    (window as unknown as { mnI18n?: { lang: string } }).mnI18n = { lang: 'en' };
  };
  afterEach(() => {
    delete (window as unknown as { mnI18n?: unknown }).mnI18n;
  });

  it('formats dates with English month names', () => {
    english();
    expect(mnui.date.format('2026-10-01')).toBe('01 Oct 2026');
    expect(mnui.date.format('2026-09')).toBe('Sep 2026');
    expect(mnui.date.months[2]).toBe('Mar');
  });

  it('labels the parts in English and relabels fields drawn before the language arrived', async () => {
    const form = document.createElement('form');
    form.innerHTML = '<label>Start<input type="date" name="d" value="2026-10-01"></label>';
    document.body.append(form);
    await Promise.resolve();
    const day = form.querySelector('.mn-date-tag') as HTMLSelectElement;
    expect(day.getAttribute('aria-label')).toBe('Tag');
    english();
    window.dispatchEvent(new CustomEvent('mn:language', { detail: 'en' }));
    expect(day.getAttribute('aria-label')).toBe('Day');
    const month = form.querySelector('.mn-date-monat') as HTMLSelectElement;
    expect(month.getAttribute('aria-label')).toBe('Month');
    expect(month.options[month.selectedIndex]?.textContent).toBe('Oct');
    expect((form.querySelector('.mn-date-jahr') as HTMLInputElement).placeholder).toBe('Year');
  });
});

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

  it('keeps a month field a month where the browser treats it as text, and checks min itself', async () => {
    const form = document.createElement('form');
    form.innerHTML = '<label>Ab<input type="month" name="m" min="2026-11"></label>';
    const input = form.querySelector('input[name=m]') as HTMLInputElement;
    // Desktop Firefox and Safari report 'text' for type="month".
    Object.defineProperty(input, 'type', { get: () => 'text' });
    document.body.append(form);
    await tick();
    expect(form.querySelectorAll('select')).toHaveLength(1);
    expect(Object.hasOwn(input, 'valueAsDate')).toBe(false);
    const month = form.querySelector('select') as HTMLSelectElement;
    (form.querySelector('.mn-date-jahr') as HTMLInputElement).value = '2026';
    month.value = '10';
    month.dispatchEvent(new Event('change', { bubbles: true }));
    expect(input.value).toBe('2026-10');
    expect(input.validationMessage).toBe('Frühestens am Nov. 2026.');
    input.value = '2026-12';
    expect(input.validationMessage).toBe('');
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

  it('keeps the parts after a partial edit and while the year is typed', async () => {
    const form = await field(
      '<label>Beginn<input type="date" name="d" value="2026-10-01"></label>',
    );
    const input = form.querySelector('input[name=d]') as HTMLInputElement;
    const [day, month] = [...form.querySelectorAll('select')] as HTMLSelectElement[];
    const year = form.querySelector('.mn-date-jahr') as HTMLInputElement;
    year.value = '2';
    year.dispatchEvent(new Event('input', { bubbles: true }));
    year.dispatchEvent(new Event('change', { bubbles: true }));
    // Incomplete: the form gets no date, but what the person typed stays.
    expect(input.value).toBe('');
    expect([day.value, month.value, year.value]).toEqual(['01', '10', '2']);
    year.value = '2027';
    year.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('2027-10-01');
  });

  it('follows form.reset() and valueAsDate', async () => {
    const form = await field(
      '<label>Beginn<input type="date" name="d" value="2026-10-01"></label>',
    );
    const input = form.querySelector('input[name=d]') as HTMLInputElement;
    const year = form.querySelector('.mn-date-jahr') as HTMLInputElement;
    input.value = '2030-01-15';
    form.reset();
    await tick();
    expect(input.value).toBe('2026-10-01');
    expect(year.value).toBe('2026');
    input.valueAsDate = new Date(Date.UTC(2031, 4, 9));
    expect(year.value).toBe('2031');
  });

  it('sends focus to the first part and mirrors disabled and required', async () => {
    const form = await field(
      '<label>Beginn<input type="date" name="d" required></label><label>Ende<input type="time" name="t" disabled></label>',
    );
    const input = form.querySelector('input[name=d]') as HTMLInputElement;
    input.focus();
    expect(document.activeElement?.className).toBe('mn-date-tag');
    expect(form.querySelector('.mn-date-tag')?.getAttribute('aria-required')).toBe('true');
    const hour = form.querySelector('.mn-date-stunde') as HTMLSelectElement;
    expect(hour.disabled).toBe(true);
    (form.querySelector('input[name=t]') as HTMLInputElement).disabled = false;
    await tick();
    expect(hour.disabled).toBe(false);
  });

  it('says why a field is invalid without taking the focus', async () => {
    const form = await field(
      '<label>Beginn<input type="date" name="d" required></label><button id="other">x</button>',
    );
    const other = form.querySelector('#other') as HTMLButtonElement;
    other.focus();
    expect(form.checkValidity()).toBe(false);
    const message = form.querySelector('.mn-date-msg') as HTMLElement;
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe('Bitte ein Datum angeben.');
    expect(document.activeElement).toBe(other);
    expect(form.querySelector('.mn-date-tag')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('names the field from the visible label text only', async () => {
    const form = await field(
      '<label><span>Erste Zahlung</span><span hidden>Zahlungsdatum</span><input type="date" name="d"></label>',
    );
    const input = form.querySelector('input[name=d]') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe('Erste Zahlung');
    const day = form.querySelector('.mn-date-tag') as HTMLElement;
    const [nameId] = (day.getAttribute('aria-describedby') ?? '').split(' ');
    expect(document.getElementById(nameId ?? '')?.textContent).toBe('Erste Zahlung');
  });

  it('keeps an existing value tracker on the input (React)', async () => {
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const tracked: string[] = [];
    const input = document.createElement('input');
    input.type = 'date';
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return native?.get?.call(this);
      },
      set(v: string) {
        tracked.push(v);
        native?.set?.call(this, v);
      },
    });
    const label = document.createElement('label');
    label.append('Datum', input);
    document.body.append(label);
    await tick();
    input.value = '2026-01-01';
    expect(tracked).toEqual(['2026-01-01']);
    expect((label.querySelector('.mn-date-jahr') as HTMLInputElement).value).toBe('2026');
  });

  it('enhances a cloned field afresh', async () => {
    const form = await field(
      '<label>Beginn<input type="date" name="d" value="2026-10-01"></label>',
    );
    const copy = form.cloneNode(true) as HTMLFormElement;
    document.body.append(copy);
    await tick();
    expect(copy.querySelectorAll('.mn-date')).toHaveLength(1);
    const month = copy.querySelector('.mn-date-monat') as HTMLSelectElement;
    month.value = '12';
    month.dispatchEvent(new Event('change', { bubbles: true }));
    expect((copy.querySelector('input[name=d]') as HTMLInputElement).value).toBe('2026-12-01');
  });

  it('leaves inputs marked data-mn-native alone', async () => {
    const form = await field('<div data-mn-native><input type="date" name="n"></div>');
    expect(form.querySelector('.mn-date')).toBeNull();
  });
});
