// @vitest-environment happy-dom
// Every view renders without an error in German and in English, and the texts follow the
// language. The page's scripts share one global scope, so they are loaded in one function.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const FILES = ['price', 'core', 'views', 'detail', 'editor', 'actions', 'stats', 'map', 'backup'];

function translator(code) {
  const pack = JSON.parse(read(`../i18n/${code}.json`));
  return (key, params = {}) => {
    let value = pack[key];
    if (value === undefined) throw new Error(`missing key ${key} (${code})`);
    if (typeof value === 'object') value = params.n === 1 ? value.one : value.other;
    return value.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
  };
}

function boot(code) {
  document.body.innerHTML =
    '<nav><button class="tab" data-tab="day"></button></nav><header class="top"><button class="add"></button><span class="side-add-label"></span><h1 id="title"></h1><p id="subtitle"></p><div id="tools"></div></header><main id="view"></main><div id="sheet-root"></div><div id="toast"></div>';
  const t = translator(code);
  window.mnI18n = {
    lang: code,
    locale: code === 'en' ? 'en-GB' : 'de-DE',
    t,
    ready: Promise.resolve(),
  };
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  const source = `${FILES.map((f) => read(`../js/${f}.js`)).join('\n')}
    S.acts = [{ id: 'a1', name: 'Beachvolleyball', category: 'Volleyball', provider: 'ZHS', location: 'Park', address: '', description: '', equipment: [], signup: 'advance', slots: [{ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '20:00' }], done: [], cancelled: [], photos: [], thumbs: {}, planned: { mode: 'both', days: [0, 1, 2, 3, 4, 5, 6], dates: [], skip: [], every: 1, season: { type: 'all' } }, level: 'Beginner', access: { guest: true }, visitPrice: 8, course: null }];
    S.plans = [{ id: 'p1', name: 'Club', type: 'recurring', amount: 29.9, every: 1, unit: 'month', start: '2026-01-01', end: '', activities: ['a1'] }];
    S.loading = false;
    leafletLoad = Promise.reject(new Error('offline')); // the map library is not loaded here
    leafletLoad.catch(() => {});
    buildIndex();
    const out = {};
    for (const view of ['day', 'cal', 'lib', 'stats', 'map']) {
      S.view = view;
      mounted = null;
      render();
      out[view] = document.querySelector('#view').textContent + document.querySelector('#title').textContent;
    }
    S.calView = 'agenda';
    S.view = 'cal';
    mounted = null;
    render();
    out.agenda = document.querySelector('#view').textContent;
    openDetail('a1', todayStr());
    out.detail = document.querySelector('#sheet-root').textContent;
    closeSheet();
    openEditor(S.acts[0]);
    out.editor = document.querySelector('#sheet-root').textContent;
    closeSheet();
    openPlanEditor(null);
    out.plan = document.querySelector('#sheet-root').textContent;
    return out;`;
  window.mininode = { mininode: () => new Promise(() => {}) }; // no connection: never answers
  return new Function(source)();
}

describe('sportplaner views', () => {
  it('render in German', () => {
    const out = boot('de');
    expect(out.lib).toContain('Bibliothek');
    expect(out.detail).toContain('Anmeldung');
    expect(out.editor).toContain('Grundlagen');
    expect(out.stats).toContain('Tarife und Mitgliedschaften');
  });

  it('render in English', () => {
    const out = boot('en');
    expect(out.lib).toContain('Library');
    expect(out.detail).toContain('Registration');
    expect(out.editor).toContain('Basics');
    expect(out.stats).toContain('Plans and memberships');
    expect(out.agenda).not.toMatch(/Angebote|Geplant/);
    expect(out.plan).not.toMatch(/Zahlung|Tarif/);
  });
});
