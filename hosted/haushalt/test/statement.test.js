import { describe, expect, it } from 'vitest';
import { toBookings } from '../csv.js';
import { linesFromItems, parseStatement, readAmount } from '../statement.js';

/** Builds pdf.js-like items from rows of [x, text] cells, top to bottom. */
const page = (rows, pageNo = 1) =>
  rows.flatMap((cells, i) =>
    cells.map(([x, str]) => ({ str, x, y: 800 - i * 12, w: str.length * 5, page: pageNo })),
  );

describe('amounts', () => {
  it('reads the German forms', () => {
    expect(readAmount('1.234,56-')).toEqual({ cents: 123456, sign: -1 });
    expect(readAmount('-45,67')).toEqual({ cents: 4567, sign: -1 });
    expect(readAmount('45,67 S')).toEqual({ cents: 4567, sign: -1 });
    expect(readAmount('2.500,00 H')).toEqual({ cents: 250000, sign: 1 });
    expect(readAmount('+ 12,00 €')).toEqual({ cents: 1200, sign: 1 });
    expect(readAmount('12,00')).toEqual({ cents: 1200, sign: 0 });
    expect(readAmount('Rechnung')).toBeNull();
  });
});

describe('statements', () => {
  it('reads a Sparkasse-like statement with signs and continuation lines', () => {
    const lines = linesFromItems(
      page([
        [[40, 'Kontoauszug 9/2026 vom 01.09.2026 bis 30.09.2026']],
        [
          [40, 'Alter Kontostand'],
          [480, '1.000,00'],
        ],
        [
          [40, '01.09.'],
          [80, '01.09.'],
          [130, 'Lastschrift'],
          [480, '45,67'],
          [510, '-'],
        ],
        [[130, 'REWE Markt GmbH']],
        [[130, 'Einkauf 30.08.2026 Karte 1']],
        [
          [40, '15.09.'],
          [80, '15.09.'],
          [130, 'Gutschrift'],
          [480, '2.500,00'],
        ],
        [[130, 'Arbeitgeber AG']],
        [[130, 'Gehalt September']],
        [
          [40, '28.09.'],
          [80, '28.09.'],
          [130, 'Stadtwerke München'],
          [480, '-89,00'],
        ],
        [[130, 'Abschlag Strom']],
        [
          [40, 'Neuer Kontostand'],
          [480, '3.365,33'],
        ],
      ]),
    );
    const parsed = parseStatement(lines, 2020);
    expect(parsed.rows).toEqual([
      ['01.09.2026', '-45,67', 'REWE Markt GmbH', 'Lastschrift Einkauf 30.08.2026 Karte 1'],
      ['15.09.2026', '2500,00', 'Arbeitgeber AG', 'Gutschrift Gehalt September'],
      ['28.09.2026', '-89,00', 'Stadtwerke München', 'Abschlag Strom'],
    ]);
    expect(parsed.guessed).toBe(1);
    // the same shape as a CSV analysis, so the import uses it unchanged
    expect(toBookings(parsed).map((b) => [b.date, b.cents, b.kind])).toEqual([
      ['2026-09-01', 4567, 'expense'],
      ['2026-09-15', 250000, 'income'],
      ['2026-09-28', 8900, 'expense'],
    ]);
  });

  it('uses Soll/Haben columns and completes years across New Year', () => {
    const lines = linesFromItems(
      page([
        [[40, 'Zeitraum 15.12.2026 - 14.01.2027']],
        [
          [40, 'Datum'],
          [130, 'Vorgang'],
          [420, 'Soll'],
          [500, 'Haben'],
        ],
        [
          [40, '30.12.'],
          [130, 'Kartenzahlung Bäckerei'],
          [410, '4,20'],
        ],
        [
          [40, '02.01.'],
          [130, 'Zinsen'],
          [490, '1,05'],
        ],
      ]),
    );
    expect(parseStatement(lines).rows).toEqual([
      ['30.12.2026', '-4,20', '', 'Kartenzahlung Bäckerei'],
      ['02.01.2027', '1,05', '', 'Zinsen'],
    ]);
  });

  it('keeps the booking amount, not the running balance, and skips page furniture', () => {
    const lines = linesFromItems([
      ...page([
        [
          [40, '03.09.2026'],
          [120, 'Spotify AB'],
          [400, '-9,99'],
          [480, '990,01'],
        ],
        [[40, 'Seite 1 von 2']],
      ]),
      ...page(
        [
          [
            [40, '04.09.2026'],
            [120, 'Netflix'],
            [400, '-13,99'],
            [480, '976,02'],
          ],
        ],
        2,
      ),
    ]);
    expect(parseStatement(lines).rows.map((r) => [r[0], r[1], r[2]])).toEqual([
      ['03.09.2026', '-9,99', 'Spotify AB'],
      ['04.09.2026', '-13,99', 'Netflix'],
    ]);
  });
});
