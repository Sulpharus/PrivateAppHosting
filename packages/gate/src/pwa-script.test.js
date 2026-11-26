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
