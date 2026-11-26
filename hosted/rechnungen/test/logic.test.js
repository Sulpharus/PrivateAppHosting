import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import {
  csvAmount,
  detectDelimiter,
  guessMapping,
  idFrom,
  parseCsv,
  parseDate,
  toCsv,
} from '../js/csv.js';
import {
  addDays,
  businessYear,
  businessYearOf,
  cancellationOf,
  nextNumber,
  statusOf,
  validNumberFormat,
  withTotals,
} from '../js/invoice.js';
import { documentLocale, invoicePdf } from '../js/invoice-pdf.js';
import { buildMessage, encodeHeader, validEmail } from '../js/mail.js';
import { blocks, inlineParts, mdToPlain, toggleCheck } from '../js/md.js';
import {
  lineNet,
  parseCents,
  parseQuantity,
  parseRate,
  split,
  totals,
  validIban,
} from '../js/money.js';
import { epcPayload, qrMatrix } from '../js/qr.js';
import { checkInvoice, plausibleVatId, taxNoteKey } from '../js/rules.js';
import { crc32, zip } from '../js/zip.js';

const line = (over = {}) => ({
  id: 'l1',
  title: 'Beratung',
  description: '',
  unit: 'Std.',
  qty_milli: 1000,
  price_cents: 10000,
  tax_bp: 1900,
  discount_bp: 0,
  ...over,
});

describe('money', () => {
  it('reads amounts in German and English form', () => {
    expect(parseCents('12,5')).toBe(1250);
    expect(parseCents('1.234,50')).toBe(123450);
    expect(parseCents('1,234.50')).toBe(123450);
    expect(parseCents('1234.5')).toBe(123450);
    expect(parseCents('1.234')).toBe(123400);
    expect(parseCents('0.5')).toBe(50);
    expect(parseCents('-3')).toBe(-300);
    expect(parseCents('95 €')).toBe(9500);
    expect(parseCents('1,2,3')).toBe(12300);
    expect(parseCents('12,345')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('')).toBeNull();
  });

  it('reads quantities and rates', () => {
    expect(parseQuantity('1,5')).toBe(1500);
    expect(parseQuantity('0.25')).toBe(250);
    expect(parseQuantity('x')).toBeNull();
    expect(parseRate('20')).toBe(2000);
    expect(parseRate('7,7 %')).toBe(770);
  });

  it('computes VAT per rate from summed net amounts and rounds once', () => {
    const lines = [
      line({ price_cents: 333, qty_milli: 3000 }),
      line({ price_cents: 1001, tax_bp: 700 }),
    ];
    const sum = totals(lines);
    expect(sum.net).toBe(999 + 1001);
    expect(sum.rates).toEqual([
      { rate: 1900, net: 999, tax: 190 },
      { rate: 700, net: 1001, tax: 70 },
    ]);
    expect(sum.gross).toBe(2000 + 260);
    expect(totals(lines, { noTax: true }).tax).toBe(0);
  });

  it('applies discounts and splits without losing cents', () => {
    expect(lineNet(line({ discount_bp: 1000 }))).toBe(9000);
    expect(lineNet(line({ qty_milli: 1500, price_cents: 3333 }))).toBe(5000);
    expect(split(1000, 3)).toEqual([334, 333, 333]);
  });

  it('checks IBANs', () => {
    expect(validIban('AT61 1904 3002 3457 3201')).toBe(true);
    expect(validIban('DE89370400440532013000')).toBe(true);
    expect(validIban('DE89370400440532013001')).toBe(false);
  });
});

describe('invoice', () => {
  it('numbers invoices per year and format', () => {
    expect(nextNumber('RE-{YYYY}-{NNNN}', '2026-03-01', [])).toBe('RE-2026-0001');
    expect(
      nextNumber('RE-{YYYY}-{NNNN}', '2026-03-01', ['RE-2026-0007', 'RE-2025-0099', 'X']),
    ).toBe('RE-2026-0008');
    expect(nextNumber('{YY}{MM}-{NN}', '2026-11-02', ['2611-09'])).toBe('2611-10');
    expect(nextNumber('R{N}', '2026-01-01', ['R9'])).toBe('R10');
    expect(validNumberFormat('RE-{YYYY}')).toBe(false);
    expect(validNumberFormat('RE-{NNN}')).toBe(true);
  });

  it('derives the status from payments and due date', () => {
    const inv = withTotals({
      id: 'a',
      status: 'issued',
      kind: 'invoice',
      tax_mode: 'standard',
      lines: [line()],
      due_date: '2026-05-10',
    });
    expect(inv.gross_cents).toBe(11900);
    expect(statusOf(inv, [], '2026-05-10').key).toBe('open');
    expect(statusOf(inv, [], '2026-05-13')).toMatchObject({ key: 'overdue', days: 3, open: 11900 });
    expect(statusOf(inv, [{ invoice_id: 'a', amount_cents: 5000 }], '2026-05-01')).toMatchObject({
      key: 'partial',
      open: 6900,
    });
    expect(statusOf(inv, [{ invoice_id: 'a', amount_cents: 11900 }], '2026-06-01').key).toBe(
      'paid',
    );
    expect(statusOf({ ...inv, status: 'draft' }, []).key).toBe('draft');
  });

  it('builds a cancellation with negative amounts', () => {
    const inv = withTotals({
      id: 'a',
      status: 'issued',
      kind: 'invoice',
      tax_mode: 'standard',
      lines: [line()],
      number: 'RE-1',
    });
    const storno = cancellationOf(inv, 'b', 'RE-2', '2026-06-01');
    expect(storno).toMatchObject({
      kind: 'cancellation',
      cancels_id: 'a',
      number: 'RE-2',
      gross_cents: -11900,
      due_date: null,
    });
  });

  it('handles business years and days', () => {
    expect(businessYear(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(businessYear(2026, 7)).toEqual({ from: '2026-07-01', to: '2027-06-30' });
    expect(businessYearOf('2027-03-01', 7)).toBe(2026);
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
  });
});

describe('rules', () => {
  const seller = {
    name: 'Muster e.U.',
    street: 'Gasse 1',
    zip: '1010',
    city: 'Wien',
    country: 'AT',
    vat_id: 'ATU12345678',
    iban: 'AT611904300234573201',
  };
  const customer = { name: 'Kunde GmbH', street: 'Weg 2', zip: '8010', city: 'Graz' };
  const invoice = {
    tax_mode: 'standard',
    lines: [line({ tax_bp: 2000 })],
    issue_date: '2026-05-01',
    service_date: '2026-05-01',
    due_date: '2026-05-15',
  };

  it('passes a complete Austrian invoice', () => {
    expect(checkInvoice({ seller, customer, invoice })).toEqual([]);
  });

  it('asks for the German tax number and the customer VAT ID for reverse charge', () => {
    const de = { ...seller, country: 'DE', vat_id: '' };
    const keys = checkInvoice({
      seller: de,
      customer,
      invoice: { ...invoice, tax_mode: 'reverse' },
    }).map((i) => i.key);
    expect(keys).toContain('check.sellerTaxDE');
    expect(keys).toContain('check.customerVatId');
    expect(keys).toContain('check.sellerVatId');
  });

  it('allows a missing customer address on small amounts only', () => {
    const small = checkInvoice({ seller, customer: { name: 'Bar' }, invoice });
    expect(small.find((i) => i.key.startsWith('check.customerAddress'))?.level).toBe('warn');
    const big = checkInvoice({
      seller,
      customer: { name: 'Bar' },
      invoice: { ...invoice, lines: [line({ price_cents: 50000, tax_bp: 2000 })] },
    });
    expect(big.find((i) => i.key === 'check.customerAddress')?.level).toBe('error');
  });

  it('names the legal note for each tax mode', () => {
    expect(taxNoteKey('small', 'DE')).toBe('doc.note.smallDE');
    expect(taxNoteKey('small', 'AT')).toBe('doc.note.smallAT');
    expect(taxNoteKey('standard', 'AT')).toBeNull();
    expect(plausibleVatId('ATU12345678')).toBe(true);
    expect(plausibleVatId('DE12345678')).toBe(false);
  });
});

function decode(matrix) {
  const n = matrix.length;
  const scale = 4;
  const quiet = 4;
  const width = (n + 2 * quiet) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let r = 0; r < n; r += 1)
    for (let c = 0; c < n; c += 1)
      if (matrix[r][c])
        for (let dy = 0; dy < scale; dy += 1)
          for (let dx = 0; dx < scale; dx += 1) {
            const i = (((r + quiet) * scale + dy) * width + (c + quiet) * scale + dx) * 4;
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
          }
  return jsQR(data, width, width)?.data ?? null;
}

describe('qr', () => {
  it('encodes payloads a reader decodes, across versions', () => {
    for (const text of ['RE-2026-0001', 'ä'.repeat(120), 'x'.repeat(320)])
      expect(decode(qrMatrix(text))).toBe(text);
  });

  it('builds the EPC payment payload', () => {
    const payload = epcPayload({
      name: 'Müller Design e.U.',
      iban: 'AT61 1904 3002 3457 3201',
      bic: 'bkauatww',
      cents: 123456,
      text: 'RE-2026-0001',
    });
    expect(payload?.split('\n')).toEqual([
      'BCD',
      '002',
      '1',
      'SCT',
      'BKAUATWW',
      'Müller Design e.U.',
      'AT611904300234573201',
      'EUR1234.56',
      '',
      '',
      'RE-2026-0001',
    ]);
    expect(decode(qrMatrix(payload ?? ''))).toBe(payload);
    expect(epcPayload({ name: 'X', iban: '', cents: 100 })).toBeNull();
  });
});

describe('pdf', () => {
  const t = (key, params = {}) => `${key}${Object.values(params).join(' ')}`;
  const invoice = {
    id: 'a',
    kind: 'invoice',
    status: 'issued',
    number: 'RE-2026-0001',
    tax_mode: 'standard',
    lang: 'de',
    layout: 'din',
    issue_date: '2026-05-01',
    service_date: '2026-05-01',
    due_date: '2026-05-15',
    lines: [line(), line({ id: 'l2', title: 'Buch', tax_bp: 700 })],
    seller: {
      name: 'Muster e.U.',
      street: 'Gasse 1',
      zip: '1010',
      city: 'Wien',
      country: 'DE',
      iban: 'DE89370400440532013000',
      vat_id: 'DE123456789',
    },
    customer: { name: 'Kunde GmbH', street: 'Weg 2', zip: '8010', city: 'Graz', country: 'AT' },
  };
  const pages = (bytes) =>
    (new TextDecoder('latin1').decode(bytes).match(/\/Type \/Page\b/g) ?? []).length;

  it('writes a one-page PDF in every layout', () => {
    for (const layout of ['din', 'modern', 'compact']) {
      const bytes = invoicePdf({
        invoice: { ...invoice, layout },
        t,
        now: new Date('2026-05-01T10:00:00Z'),
      });
      const text = new TextDecoder('latin1').decode(bytes);
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
      expect(pages(bytes)).toBe(1);
    }
  });

  it('continues on more pages only when the lines do not fit', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      line({ id: `l${i}`, title: `Position ${i}` }),
    );
    expect(pages(invoicePdf({ invoice: { ...invoice, lines: many }, t }))).toBeGreaterThan(1);
    expect(
      pages(
        invoicePdf({ invoice: { ...invoice, layout: 'compact', lines: many.slice(0, 18) }, t }),
      ),
    ).toBe(1);
  });

  it('uses Austrian formats for Austrian sellers', () => {
    expect(documentLocale('de', 'AT')).toBe('de-AT');
    expect(documentLocale('en', 'AT')).toBe('en-GB');
  });
});

describe('csv, zip, mail, markdown', () => {
  it('reads CSV with quotes and guesses columns', () => {
    const text = 'Firma;PLZ;Ort;E-Mail\n"Muster; GmbH";1010;Wien;max@example.com\n';
    expect(detectDelimiter(text)).toBe(';');
    const rows = parseCsv(text);
    expect(rows[1][0]).toBe('Muster; GmbH');
    expect(guessMapping(rows[0], 'customers')).toMatchObject({
      name: 0,
      zip: 1,
      city: 2,
      email: 3,
      street: -1,
    });
    expect(parseDate('24.09.2026')).toBe('2026-09-24');
    expect(parseDate('31.02.2026')).toBeNull();
  });

  it('writes CSV per language', () => {
    expect(toCsv([['a', 'b;c']], 'de')).toBe('﻿a;"b;c"\r\n');
    expect(csvAmount(-123456, 'de')).toBe('-1234,56');
    expect(csvAmount(5, 'en')).toBe('0.05');
  });

  it('derives stable ids', async () => {
    expect(await idFrom('x')).toBe(await idFrom('x'));
    expect(await idFrom('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('writes a ZIP with correct checksums', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const out = zip([{ name: 'a.txt', bytes: new TextEncoder().encode('hallo') }]);
    expect(new DataView(out.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(new DataView(out.buffer).getUint32(out.length - 22, true)).toBe(0x06054b50);
  });

  it('builds a Gmail message with an attachment', () => {
    expect(validEmail('max@example.com')).toBe(true);
    expect(validEmail('a@b.c\nBcc: x@y.z')).toBe(false);
    expect(encodeHeader('Rechnung für Sie')).toMatch(/^=\?UTF-8\?B\?/);
    const raw = buildMessage({
      to: 'max@example.com',
      subject: 'Rechnung',
      text: 'Hallo',
      attachments: [{ name: 'r.pdf', type: 'application/pdf', bytes: new Uint8Array([37, 80]) }],
    });
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    expect(decoded).toContain('To: max@example.com');
    expect(decoded).toContain('filename="r.pdf"');
  });

  it('parses the Markdown subset without markup', () => {
    expect(inlineParts('**fett** und [Link](https://example.com)')).toEqual([
      { type: 'bold', text: 'fett' },
      { type: 'text', text: ' und ' },
      { type: 'link', text: 'Link', href: 'https://example.com' },
    ]);
    expect(inlineParts('[x](javascript:alert(1))')).toEqual([
      { type: 'text', text: '[x](javascript:alert(1))' },
    ]);
    expect(blocks('- [ ] a\n- b')[0]).toMatchObject({ type: 'check', done: false });
    expect(toggleCheck('- [ ] a', 0)).toBe('- [x] a');
    expect(mdToPlain('Hallo **du**\n- eins')).toBe('Hallo du\n• eins');
  });
});

describe('review fixes', () => {
  it('cuts text to the exact column limits and drops unknown enum values', async () => {
    const { shape } = await import('../js/store.js');
    const c = shape('customers', {
      id: 'x',
      name: 'n'.repeat(300),
      phone: '1'.repeat(80),
      zip: '9'.repeat(30),
      country: 'de',
    });
    expect(c.name).toHaveLength(200);
    expect(c.phone).toHaveLength(60);
    expect(c.zip).toHaveLength(20);
    expect(c.country).toBe('DE');
    const p = shape('payments', { id: 'p', note: 'x'.repeat(400) });
    expect(p.note).toHaveLength(300);
    const inv = shape('invoices', {
      id: 'i',
      status: 'weird',
      layout: 'fancy',
      reference: 'r'.repeat(200),
    });
    expect(inv).toMatchObject({ status: 'draft', layout: 'din' });
    expect(inv.reference).toHaveLength(120);
  });

  it('keeps the signs of a normal copy and flips a cancellation back', async () => {
    const { copyLines } = await import('../js/invoice.js');
    let n = 0;
    const id = () => {
      n += 1;
      return `n${n}`;
    };
    const lines = [line(), line({ id: 'd', title: 'Rabatt', price_cents: -5000 })];
    expect(copyLines(lines, 'invoice', id).map((l) => l.price_cents)).toEqual([10000, -5000]);
    expect(copyLines(lines, 'cancellation', id).map((l) => l.price_cents)).toEqual([-10000, 5000]);
  });

  it('dates an old draft today and keeps the length of its payment term', async () => {
    const { issueDates } = await import('../js/actions.js');
    expect(issueDates({ issue_date: '2026-10-01', due_date: '2026-10-15' }, '2026-11-26')).toEqual({
      issue_date: '2026-11-26',
      due_date: '2026-12-10',
    });
    expect(issueDates({ issue_date: '2026-11-26', due_date: null }, '2026-11-26')).toEqual({
      issue_date: '2026-11-26',
      due_date: null,
    });
  });

  it('imports a backup without overwriting, originals before cancellations, without stored PDFs', async () => {
    const { planImport } = await import('../js/backup.js');
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const c = '33333333-3333-4333-8333-333333333333';
    const data = {
      customers: [
        { id: c, name: 'Kunde' },
        { id: 'not-a-uuid', name: 'X' },
      ],
      invoices: [
        {
          id: b,
          kind: 'cancellation',
          status: 'issued',
          number: 'RE-2',
          issue_date: '2026-01-02',
          cancels_id: a,
          lines: [],
        },
        {
          id: a,
          kind: 'invoice',
          status: 'issued',
          number: 'RE-1',
          issue_date: '2026-01-01',
          lines: [line()],
          pdf_path: 'rechnungen/2026/RE-1.pdf',
        },
      ],
      payments: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          invoice_id: a,
          paid_on: '2026-01-05',
          amount_cents: 100,
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          invoice_id: c,
          paid_on: '2026-01-05',
          amount_cents: 100,
        },
      ],
    };
    const plan = planImport(data, (table, id) => table === 'customers' && id === c);
    expect(plan.customers).toEqual([]);
    expect(plan.invoices.map((i) => i.id)).toEqual([a, b]);
    expect(plan.invoices[0].pdf_path).toBeNull();
    expect(plan.payments).toHaveLength(1);
  });

  it('escapes spreadsheet formulas but not numbers, and quotes in file names', () => {
    expect(toCsv([['=HYPERLINK("x")', '-12,50', '@sum']], 'de')).toBe(
      '﻿"\'=HYPERLINK(""x"")";-12,50;\'@sum\r\n',
    );
    expect(encodeHeader('Rechnung "A".pdf')).toMatch(/^=\?UTF-8\?B\?/);
  });
});
