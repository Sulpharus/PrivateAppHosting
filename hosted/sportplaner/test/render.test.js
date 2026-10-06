// @vitest-environment happy-dom
// Every view renders without an error in German and in English, and the texts follow the
// language. The page's scripts share one global scope, so they are loaded in one function.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const FILES = [
  'price',
  'core',
  'quota',
  'views',
  'detail',
  'editor',
  'actions',
  'stats',
  'map',
  'backup',
  'tables',
];

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
    out.sports = sportsOf(' Schwimmen, sauna ;Schwimmen,, Yoga ');
    out.norm = normSports('Schwimmen,Sauna ,schwimmen');
    // An offer with two sports: one chip each, found under each sport, its cost shared.
    S.acts[0].category = 'Schwimmen, Sauna';
    S.acts[0].done = [todayStr()];
    S.plans[0].category = '';
    S.plans[0].type = 'visit';
    S.plans[0].amount = 10;
    S.cat = 'Sauna';
    S.view = 'lib';
    mounted = null;
    render();
    out.libSauna = document.querySelector('#view').textContent;
    openDetail('a1', todayStr());
    out.chips = [...document.querySelectorAll('#sheet-root .chip')].map((c) => c.textContent);
    closeSheet();
    out.groups = computeStats(new Date().getFullYear()).groups.category;

    // Credits (ClassPass) and a visit allowance (Urban Sports Club) on a membership.
    S.acts[0].category = 'Yoga';
    S.acts[0].access = { membership: true };
    S.acts[0].done = ['2026-10-01', '2026-10-02'];
    S.acts.push({ ...JSON.parse(JSON.stringify(S.acts[0])), id: 'a2', name: 'Pilates', done: ['2026-10-03'] });
    const plan = {
      id: 'p9', name: 'ClassPass', type: 'recurring', amount: 49, every: 1, unit: 'month', start: '2026-01-01', end: '',
      activities: ['a1', 'a2'], quota: { mode: 'credits', month: 10, day: 1 },
      links: { a1: { credits: 4, month: 0 }, a2: { credits: 3, month: 0 } },
    };
    S.plans = [plan];
    out.creditsNow = quotaLines(plan, '2026-10-20');
    out.creditsOver = quotaProblems(S.acts[0], '2026-10-04'); // 3 x 4 + 3 = 15 > 10
    out.creditsFits = quotaProblems(S.acts[1], '2026-10-03'); // 8 + 3 = 11 > 10 as well
    const usc = { ...plan, id: 'p10', name: 'Urban', quota: { mode: 'visits', month: 12, day: 1 }, links: { a1: { credits: 0, month: 2 }, a2: { credits: 0, month: 0 } } };
    S.plans = [usc];
    out.visitsAct = quotaProblems(S.acts[0], '2026-10-05'); // a1 would be the 3rd of 2
    S.acts[1].done = ['2026-10-05'];
    out.visitsDay = quotaProblems(S.acts[0], '2026-10-05'); // two activities on one day
    out.visitsLines = quotaLines(usc, '2026-10-20');
    out.actLines = quotaActivityLines(usc, S.acts[0], '2026-10-20');
    S.plans = [plan];
    openEditor(S.acts[0]);
    out.editorQuota = document.querySelector('#sheet-root').textContent;
    out.editorFields = document.querySelectorAll('#sheet-root .quota-link').length;
    closeSheet();
    openPlanEditor(plan);
    out.planQuota = document.querySelector('#sheet-root').textContent;
    closeSheet();
    // Rows of the tables and back: nothing gets lost, also for fields of older versions.
    const full = sanitizeAct({ ...S.acts[0], signupUrl: 'https://x.test', geo: { lat: 52.5, lon: 13.4, label: 'Park', q: 'Park, Berlin' }, course: { from: '2026-01-05', until: '2026-03-30', price: 90, priceType: 'month' }, slots: [{ kind: 'date', date: '2026-10-12', start: '10:00', end: '11:00' }], cancelled: ['2026-10-19'], from: '2025-01-01', updatedAt: 1760000000000, legacyNote: 'kept' }, true);
    out.actBack = [rowAct(actRow(full)), sanitizeAct(full, true)];
    out.actRow = actRow(full);
    out.planBack = [rowPlan(planRow(plan)), sanitizePlan(plan)];
    out.planOpen = rowPlan(planRow(sanitizePlan({ id: 'p0', name: 'Einzel', type: 'once', amount: 5 })));
    // Values the columns refuse are cut or cleaned before they reach a row.
    const odd = sanitizeAct({ id: 'o', name: 'x'.repeat(900), description: 'd'.repeat(30000), visitPrice: 1e12, signup: 'constructor', done: ['2026-02-31', '2026-03-01'], course: { from: '2026-01-01', until: '2026-02-01', price: 0.001 }, updatedAt: 1e30 }, true);
    out.oddRow = actRow(odd);
    out.oddPlan = planRow(sanitizePlan({ id: 'q', type: 'toString', unit: 'constructor', amount: 1e12, visits: 1e12 }));
    out.clean = [sanitizePlan({ ...plan, quota: { mode: 'credits', month: '12.7', day: -3 } }), sanitizePlan({ ...plan, quota: { mode: 'weird' } })];
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

  it('takes several sports in one field, separated by commas', () => {
    const out = boot('de');
    expect(out.sports).toEqual(['Schwimmen', 'sauna', 'Yoga']);
    expect(out.norm).toBe('Schwimmen, Sauna');
    expect(out.libSauna).toContain('Beachvolleyball');
    expect(out.chips).toEqual(expect.arrayContaining(['Schwimmen', 'Sauna']));
    expect(Object.fromEntries(out.groups)).toEqual({ Schwimmen: 5, Sauna: 5 });
  });

  it('knows credits and visit allowances of a membership', () => {
    const out = boot('de');
    expect(out.creditsNow[0]).toBe('11 von 10 Credits im Oktober verbraucht, 0 übrig.');
    expect(out.creditsNow[1]).toBe('Höchstens 1 pro Tag.');
    expect(out.creditsOver.some((m) => m.includes('Credits von ClassPass überschritten'))).toBe(
      true,
    );
    expect(out.visitsAct.some((m) => m.includes('auf 2 Besuche im Monat begrenzt'))).toBe(true);
    expect(out.visitsDay.some((m) => m.includes('höchstens 1 Besuche pro Tag'))).toBe(true);
    expect(out.visitsLines[0]).toContain('von 12 Besuchen im Oktober');
    expect(out.actLines.some((m) => m.includes('Diese Aktivität: 2 von 2'))).toBe(true);
    // The activity asks what it costs, the tariff editor asks for the allowance.
    expect(out.editorFields).toBeGreaterThan(0);
    expect(out.editorQuota).toContain('Credits pro Besuch');
    expect(out.planQuota).toContain('Credits pro Monat');
    expect(out.clean[0].quota).toEqual({ mode: 'credits', month: 12, day: 0 });
    expect(out.clean[1].quota).toBeUndefined();
  });

  it('keeps everything on the way into and out of the tables', () => {
    const out = boot('de');
    expect(out.actBack[0]).toEqual(out.actBack[1]);
    expect(out.actRow.details).toEqual({ legacyNote: 'kept', from: '2025-01-01' });
    expect(out.actRow.signup_url).toBe('https://x.test');
    expect(out.actRow.course_price_type).toBe('month');
    expect(out.actRow.geo_lat).toBe(52.5);
    expect(out.actRow.owner_id).toBeUndefined();
    expect(out.planBack[0]).toEqual(out.planBack[1]);
    expect(out.planOpen.start).toBe('');
    expect(out.planOpen.quota).toBeUndefined();
  });

  it('keeps what the columns refuse out of the rows', () => {
    const { oddRow, oddPlan } = boot('de');
    expect(oddRow.name).toHaveLength(500);
    expect(oddRow.description).toHaveLength(20000);
    expect(oddRow.visit_price).toBeLessThan(1e8);
    expect(oddRow.signup).toBe('none');
    expect(oddRow.done).toEqual(['2026-03-01']);
    expect(oddRow.course_price).toBeNull();
    expect(oddRow.edited_ms).toBeLessThanOrEqual(1e15);
    expect(oddPlan).toMatchObject({ type: 'recurring', unit: 'month' });
    expect(oddPlan.amount).toBeLessThan(1e8);
    expect(oddPlan.visits).toBeLessThanOrEqual(1e9);
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
