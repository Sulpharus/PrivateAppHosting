// Unit tests for the pure modules: CSV import/export, bookings and standing orders, tax rules.
import { describe, expect, it } from 'vitest';
import { analyse, parseAmount, parseDate, toBookings, toCsv } from '../csv.js';
import { cleanBooking, cleanProfile, dueRecurring, matchRule } from '../data.js';
import {
  buildReturn,
  entfernungspauschale,
  FIELDS,
  homeofficePauschale,
  params,
  zumutbareBelastung,
} from '../tax.js';

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 123456],
    ['-12,3', -1230],
    ['1,234.56', 123456],
    ['12,30 S', -1230],
    ['12,30 €', 1230],
    ['1.234', 123400],
    ['1.000.000', 100000000],
    ['12.50', 1250],
    ['0,99', 99],
    ['1234', 123400],
  ])('%s → %i', (input, cents) => {
    expect(parseAmount(input)).toBe(cents);
  });
  it.each(['abc', '1,2,3', '12,345', '1.23.4', ''])('rejects %s', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads German and ISO dates and rejects impossible ones', () => {
    expect(parseDate('24.09.2026')).toBe('2026-09-24');
    expect(parseDate('1.3.26')).toBe('2026-03-01');
    expect(parseDate('2026-09-24')).toBe('2026-09-24');
    expect(parseDate('31.02.2026')).toBeNull();
  });
});

describe('bank CSV', () => {
  it('skips the preamble, handles quotes and line breaks', () => {
    const text =
      'Konto;DE00\n\n"Buchungstag";"Auftraggeber/Empfänger";"Verwendungszweck";"Betrag (EUR)"\n' +
      '"24.09.2026";"REWE";"Karte; Einkauf";"-45,10"\n"01.09.2026";"ACME";"Gehalt\nSeptember";"3.210,00"\n';
    expect(toBookings(analyse(text))).toEqual([
      { date: '2026-09-24', cents: 4510, kind: 'expense', party: 'REWE', text: 'Karte; Einkauf' },
      {
        date: '2026-09-01',
        cents: 321000,
        kind: 'income',
        party: 'ACME',
        text: 'Gehalt September',
      },
    ]);
  });
  it('uses a separate Soll/Haben column for the sign', () => {
    const parsed = analyse(
      'Buchungstag;Umsatz;Soll/Haben;Empfänger\n01.09.2026;12,30;S;REWE\n02.09.2026;100,00;H;ACME\n',
    );
    expect(toBookings(parsed).map((b) => [b.cents, b.kind])).toEqual([
      [1230, 'expense'],
      [10000, 'income'],
    ]);
  });
});

describe('toCsv', () => {
  it('neutralises formulas but keeps numbers', () => {
    const out = toCsv([['-1+1+cmd|calc!A0', '=SUM(A1)', '-12,50', '3.210,00', 'a;b', 'x"y']]);
    expect(out).toBe('﻿\'-1+1+cmd|calc!A0;\'=SUM(A1);-12,50;3.210,00;"a;b";"x""y"');
  });
});

describe('bookings and standing orders', () => {
  it('drops malformed bookings and unknown tax fields', () => {
    expect(cleanBooking({ id: 'a', date: '2026-1-1', cents: 1 }, FIELDS)).toBeNull();
    expect(cleanBooking({ id: 'a b', date: '2026-01-01', cents: 1 }, FIELDS)).toBeNull();
    const b = cleanBooking(
      { id: 'a', date: '2026-01-01', cents: 5, taxField: 'nope', receipt: 'belege/../x' },
      FIELDS,
    );
    expect(b).toMatchObject({ id: 'a', kind: 'expense' });
    expect(b).not.toHaveProperty('taxField');
    expect(b).not.toHaveProperty('receipt');
  });
  it('books each due month once, from the first month and every n months', () => {
    const rec = {
      id: 'r',
      cents: 100,
      kind: 'expense',
      cat: '',
      text: 'Miete',
      every: 3,
      day: 15,
      start: '2026-01',
      end: '',
      until: '',
    };
    const due = dueRecurring(rec, '2026-09-24');
    expect(due.map((d) => d.booking.date)).toEqual(['2026-01-15', '2026-04-15', '2026-07-15']);
    expect(due[0].booking.id).toBe('r-r-2026-01');
    expect(dueRecurring({ ...rec, until: '2026-07' }, '2026-09-24')).toEqual([]);
    expect(dueRecurring({ ...rec, every: 1, day: 28 }, '2026-09-24').at(-1)?.month).toBe('2026-08');
  });
  it('matches rules case-insensitively on payee and text', () => {
    const cats = [{ id: 'food' }];
    expect(
      matchRule([{ match: 'rewe|edeka', cat: 'food' }], { party: 'REWE Markt', text: '' }, cats),
    ).toBe('food');
    expect(matchRule([{ match: 'x', cat: 'gone' }], { party: 'x', text: '' }, cats)).toBe('');
  });
});

describe('tax rules', () => {
  it('uses the parameters of the tax year', () => {
    expect(params(2021).arbeitnehmerPauschbetrag).toBe(100000);
    expect(params(2022).arbeitnehmerPauschbetrag).toBe(120000);
    expect(params(2026).arbeitnehmerPauschbetrag).toBe(123000);
    expect(homeofficePauschale(2019, 100)).toBe(0);
    expect(homeofficePauschale(2021, 200)).toBe(60000);
    expect(homeofficePauschale(2026, 300)).toBe(126000);
  });
  it('computes the distance allowance with the 2026 rate and the car exception', () => {
    expect(entfernungspauschale(2025, 25, 200)).toBe(158000);
    expect(entfernungspauschale(2026, 25, 200)).toBe(190000);
    expect(entfernungspauschale(2026, 100, 220)).toBe(450000);
    expect(entfernungspauschale(2026, 100, 220, true)).toBe(836000);
  });
  it('computes the reasonable burden stepwise', () => {
    expect(zumutbareBelastung(4000000, false, 0)).toBe(224660);
    expect(zumutbareBelastung(4000000, false, 1)).toBe(104660);
    expect(zumutbareBelastung(1000000, true, 3)).toBe(10000);
  });
  it('fills the forms from bookings', () => {
    const forms = buildReturn(
      2026,
      [
        {
          date: '2026-03-01',
          cents: 50000,
          kind: 'expense',
          taxField: 'hh_handwerker',
          taxCents: 30000,
        },
        { date: '2026-03-02', cents: 20000, kind: 'expense', taxField: 'kind_betreuung' },
        { date: '2026-03-03', cents: 500, kind: 'expense', taxField: 'wk_kontofuehrung' },
        { date: '2026-03-04', cents: 80000, kind: 'expense', taxField: 'wk_arbeitszimmer' },
        { date: '2025-12-31', cents: 99999, kind: 'expense', taxField: 'sa_spenden' },
      ],
      { homeofficeDays: 50, children: 1 },
    );
    const byId = Object.fromEntries(forms.map((f) => [f.id, f]));
    const hh = byId.HH.rows.find((r) => r.key === 'hh_handwerker');
    expect(hh).toMatchObject({ cents: 30000, reduction: 6000 });
    expect(byId.KIND.rows.find((r) => r.key === 'kind_betreuung')?.deductible).toBe(16000);
    // Arbeitszimmer replaces the daily flat rate; Kontoführung takes the 16 € flat rate.
    const n = byId.N.rows.map((r) => [r.key, r.cents]);
    expect(n).not.toContainEqual(['wk_homeoffice', expect.anything()]);
    expect(n).toContainEqual(['wk_kontofuehrung', 1600]);
    expect(byId.N.total).toBe(81600);
    expect(byId.SA.total).toBe(0);
  });
  it('clamps profile input', () => {
    expect(cleanProfile({ commuteKm: -5, children: 2, car: true })).toMatchObject({
      commuteKm: 0,
      children: 2,
      car: true,
    });
  });
});
