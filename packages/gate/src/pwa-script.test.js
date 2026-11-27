// @vitest-environment happy-dom
// Plain JS: the gate's tsconfig has Workers types only, and this test needs Node and the DOM.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// pwa.js (served as /_mininode/pwa.js) ends the start screen once the page shows something.
const script = readFileSync(join(import.meta.dirname, '../assets/pwa.js'), 'utf8');

function start(body) {
  document.body.innerHTML = `<div id="mn-splash"></div>${body}`;
  new Function(script)();
  return document.getElementById('mn-splash');
}

describe('pwa.js start screen', () => {
  afterEach(() => vi.useRealTimers());

  it('counts a canvas placed directly in the body as content', () => {
    vi.useFakeTimers();
    const splash = start('<canvas></canvas>');
    vi.advanceTimersByTime(5000);
    expect(splash?.classList.contains('mns-out')).toBe(true);
  });

  it('keeps the screen while the body holds only a hidden input', () => {
    vi.useFakeTimers();
    const splash = start('<input type="hidden" value="x">');
    vi.advanceTimersByTime(5000);
    expect(splash?.classList.contains('mns-out')).toBe(false);
  });
});

describe('pwa.js in the portal viewer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hands links to other origins to the portal, and only to the portal', () => {
    const postMessage = vi.fn();
    const parent = { postMessage };
    vi.stubGlobal('parent', parent);
    vi.stubGlobal('top', parent);
    vi.stubGlobal('location', new URL('https://kalender.example.org/woche'));
    document.body.innerHTML =
      '<a id="other" href="https://notizen.example.org/">x</a><a id="own" href="https://kalender.example.org/monat">y</a>';
    new Function(script)();
    const other = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('other')?.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'mn:open', url: 'https://notizen.example.org/' },
      'https://example.org',
    );
    const own = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('own')?.dispatchEvent(own);
    expect(own.defaultPrevented).toBe(false);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('pwa.js: what an app opens "in a new tab" inside the portal viewer', () => {
  let postMessage;
  let assign;
  let nativeOpen;

  const startFramed = () => {
    postMessage = vi.fn();
    assign = vi.fn();
    nativeOpen = vi.fn(() => null);
    const parent = { postMessage };
    vi.stubGlobal('parent', parent);
    vi.stubGlobal('top', parent);
    vi.stubGlobal('open', nativeOpen);
    vi.stubGlobal(
      'location',
      Object.assign(new URL('https://rechnungen.example.org/rechnung/7'), { assign }),
    );
    new Function(script)();
  };

  afterEach(() => vi.unstubAllGlobals());

  it('shows the PDF given to an empty window here, never in a separate window', () => {
    startFramed();
    // Rechnungen and Haushalt: an empty tab on the click, its address after an await.
    const win = window.open('', '_blank');
    expect(win).not.toBeNull();
    win.opener = null;
    win.location.href = 'blob:https://rechnungen.example.org/1234';
    expect(assign).toHaveBeenCalledWith('blob:https://rechnungen.example.org/1234');
    expect(nativeOpen).not.toHaveBeenCalled();
  });

  it('shows a stored file given to an empty window here too', () => {
    startFramed();
    const tab = window.open('', '_blank');
    tab.location.href = 'https://proj.supabase.co/storage/v1/object/sign/beleg.pdf?token=x';
    expect(assign).toHaveBeenCalledWith(
      'https://proj.supabase.co/storage/v1/object/sign/beleg.pdf?token=x',
    );
    expect(nativeOpen).not.toHaveBeenCalled();
  });

  it("opens the app's own content here and hands web addresses to the portal", () => {
    startFramed();
    window.open('blob:https://rechnungen.example.org/5678', '_blank');
    expect(assign).toHaveBeenCalledWith('blob:https://rechnungen.example.org/5678');
    window.open('https://kalender.example.org/woche');
    window.open('https://shop.example.com/artikel');
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'mn:open', url: 'https://kalender.example.org/woche' },
      'https://example.org',
    );
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'mn:open', url: 'https://shop.example.com/artikel' },
      'https://example.org',
    );
    expect(nativeOpen).not.toHaveBeenCalled();
  });

  it("hands an empty window's platform address to the portal", () => {
    startFramed();
    const win = window.open();
    win.location = 'https://example.org/account';
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'mn:open', url: 'https://example.org/account' },
      'https://example.org',
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows a new-tab link to the app's own file here, and leaves downloads alone", () => {
    startFramed();
    document.body.innerHTML =
      '<a id="pdf" target="_blank" href="https://rechnungen.example.org/files/a.pdf">a</a>' +
      '<a id="dl" download="a.pdf" target="_blank" href="blob:https://rechnungen.example.org/9">b</a>';
    const pdf = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('pdf')?.dispatchEvent(pdf);
    expect(pdf.defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith('https://rechnungen.example.org/files/a.pdf');
    const dl = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('dl')?.dispatchEvent(dl);
    expect(dl.defaultPrevented).toBe(false);
  });

  it('leaves window.open alone outside the viewer', () => {
    nativeOpen = vi.fn(() => null);
    vi.stubGlobal('open', nativeOpen);
    vi.stubGlobal('location', new URL('https://rechnungen.example.org/'));
    new Function(script)();
    window.open('', '_blank');
    expect(nativeOpen).toHaveBeenCalled();
  });
});
