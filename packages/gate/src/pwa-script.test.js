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
