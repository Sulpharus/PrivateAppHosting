// The invoice as a PDF in one of three layouts: "din" (DIN 5008 form B with address window and
// fold marks), "modern" and "compact". Everything is laid out to fit one A4 page; only when the
// lines really do not fit does it continue on further pages with the table header repeated, and
// the type is never made smaller to force it onto one page.

import { mdToPlain } from './md.js';
import { formatIban, formatQuantity, lineNet, totals } from './money.js';
import { A4, FONTS, PdfDocument, wrap } from './pdf.js';
import { epcPayload, qrMatrix } from './qr.js';
import { chargesNoTax, taxNoteKey } from './rules.js';

export const LAYOUTS = ['din', 'modern', 'compact'];

const MM = 72 / 25.4;
const INK = '#15191c';
const MUTED = '#5b646c';
const LINE = '#c9cec8';
const TINT = '#eef2f8';
const ACCENT = '#1a4f9e';

/** The locale of the document: its language, and Austrian formats for Austrian sellers. */
export function documentLocale(lang, country) {
  if (lang === 'en') return 'en-GB';
  return country === 'AT' ? 'de-AT' : 'de-DE';
}

/**
 * Builds the PDF bytes. `t(key, params)` gives document texts in the invoice's language.
 * `invoice` carries the seller and customer snapshots; `logo` is optional JPEG bytes;
 * `cancelled` names the invoice a cancellation refers to ({ number, issue_date }).
 */
export function invoicePdf({ invoice, t, logo = null, cancelled = null, now = new Date() }) {
  const seller = invoice.seller ?? {};
  const customer = invoice.customer ?? {};
  const country = seller.country === 'AT' ? 'AT' : 'DE';
  const locale = documentLocale(invoice.lang, country);
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
  const fmt = (cents) => money.format(cents / 100);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const date = (iso) => (iso ? dateFormat.format(new Date(`${iso}T00:00:00Z`)) : '');
  const percent = (bp) =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(
      bp / 10000,
    );
  const layout = LAYOUTS.includes(invoice.layout) ? invoice.layout : 'din';
  const noTax = chargesNoTax(invoice.tax_mode ?? 'standard');
  const sum = totals(invoice.lines ?? [], { noTax });
  const isCancellation = invoice.kind === 'cancellation';
  const title = isCancellation ? t('doc.cancellationTitle') : t('doc.title');

  const doc = new PdfDocument({
    title: `${title} ${invoice.number ?? ''}`.trim(),
    author: seller.name ?? '',
    subject: title,
  });
  const logoImage = logo ? safeJpeg(doc, logo) : null;

  // Geometry per layout.
  const g =
    layout === 'din'
      ? { left: 25 * MM, right: A4.width - 20 * MM, footerTop: A4.height - 26 * MM }
      : layout === 'modern'
        ? { left: 18 * MM, right: A4.width - 18 * MM, footerTop: A4.height - 24 * MM }
        : { left: 15 * MM, right: A4.width - 15 * MM, footerTop: A4.height - 22 * MM };
  g.width = g.right - g.left;
  const body = layout === 'compact' ? 8.5 : 9.5;

  // ---------- pieces ----------
  const sellerLine = [seller.name, seller.street, `${seller.zip ?? ''} ${seller.city ?? ''}`.trim()]
    .filter(Boolean)
    .join(' · ');
  const addressLines = [
    customer.name,
    customer.contact,
    customer.street,
    `${customer.zip ?? ''} ${customer.city ?? ''}`.trim(),
    customer.country && customer.country !== country ? regionName(customer.country, locale) : '',
  ].filter(Boolean);

  const meta = [
    [
      isCancellation ? t('doc.cancellationNumber') : t('doc.number'),
      invoice.number ?? t('doc.draft'),
    ],
    [t('doc.issueDate'), date(invoice.issue_date)],
    [
      t('doc.serviceDate'),
      invoice.service_end && invoice.service_end !== invoice.service_date
        ? t('doc.servicePeriod', {
            from: date(invoice.service_date),
            to: date(invoice.service_end),
          })
        : date(invoice.service_date),
    ],
  ];
  if (customer.number) meta.push([t('doc.customerNumber'), customer.number]);
  if (customer.vat_id) meta.push([t('doc.customerVatId'), customer.vat_id]);
  if (invoice.reference) meta.push([t('doc.reference'), invoice.reference]);

  const taxIdLabel = country === 'AT' ? t('doc.uid') : t('doc.vatId');
  const footerCols = [
    [seller.name, seller.owner, seller.street, `${seller.zip ?? ''} ${seller.city ?? ''}`.trim()],
    [
      seller.phone ? `${t('doc.phone')} ${seller.phone}` : '',
      seller.email,
      seller.website,
      seller.register,
    ],
    [
      seller.vat_id ? `${taxIdLabel} ${seller.vat_id}` : '',
      seller.tax_number ? `${t('doc.taxNumber')} ${seller.tax_number}` : '',
      seller.bank,
      seller.iban ? `IBAN ${formatIban(seller.iban)}` : '',
      seller.bic ? `BIC ${seller.bic}` : '',
    ],
  ].map((col) => col.filter(Boolean));

  // ---------- table ----------
  const showRate = !noTax && new Set((invoice.lines ?? []).map((l) => l.tax_bp)).size > 1;
  const cols = (() => {
    const amountW = 72;
    const priceW = 68;
    const qtyW = 62;
    const rateW = showRate ? 38 : 0;
    const posW = layout === 'compact' ? 20 : 24;
    const amountX = g.right;
    const priceX = amountX - amountW;
    const rateX = priceX - priceW;
    const qtyX = rateX - rateW;
    return {
      pos: g.left,
      title: g.left + posW,
      titleW: qtyX - qtyW - (g.left + posW) - 8,
      qty: qtyX,
      rate: rateX,
      price: priceX,
      amount: amountX,
    };
  })();
  const rowPad = layout === 'compact' ? 3.5 : 5;
  const lineGap = body * 1.28;
  const rows = (invoice.lines ?? []).map((line, index) => {
    const titleLines = wrap(line.title ?? '', FONTS.bold, body, cols.titleW);
    const extra = [];
    if (line.description)
      extra.push(...wrap(line.description, FONTS.regular, body - 1, cols.titleW));
    if (line.discount_bp)
      extra.push(
        ...wrap(
          t('doc.discount', { rate: percent(line.discount_bp) }),
          FONTS.italic,
          body - 1,
          cols.titleW,
        ),
      );
    const height = rowPad * 2 + titleLines.length * lineGap + extra.length * (body - 1) * 1.3;
    return { line, index, titleLines, extra, height };
  });
  const headHeight = body + rowPad * 2 + 2;

  // ---------- blocks after the table ----------
  const totalsRows = [];
  if (!noTax) {
    totalsRows.push([t('doc.net'), fmt(sum.net)]);
    for (const r of sum.rates)
      totalsRows.push([t('doc.taxLine', { rate: percent(r.rate), base: fmt(r.net) }), fmt(r.tax)]);
  }
  const totalLabel = noTax ? t('doc.totalNoTax') : t('doc.total');
  const totalsHeight = totalsRows.length * (body + 5) + body + 18;

  const noteKey = taxNoteKey(invoice.tax_mode ?? 'standard', country);
  const notes = [];
  if (isCancellation && cancelled)
    notes.push(t('doc.cancels', { number: cancelled.number, date: date(cancelled.issue_date) }));
  if (noteKey) notes.push(t(noteKey));
  if (
    (invoice.tax_mode === 'reverse' || invoice.tax_mode === 'intra') &&
    seller.vat_id &&
    customer.vat_id
  )
    notes.push(t('doc.vatIds', { seller: seller.vat_id, customer: customer.vat_id }));
  const intro = mdToPlain(invoice.intro ?? '');
  const closing = mdToPlain(invoice.closing ?? '');
  const payable = !isCancellation && sum.gross > 0;
  const payText = payable
    ? invoice.due_date
      ? t('doc.payUntil', { date: date(invoice.due_date), number: invoice.number ?? '' })
      : t('doc.payNow', { number: invoice.number ?? '' })
    : '';
  const qrPayload =
    payable && seller.qr !== false
      ? epcPayload({
          name: seller.name,
          iban: seller.iban,
          bic: seller.bic,
          cents: sum.gross,
          text: invoice.number ?? '',
        })
      : null;
  const qrSize = 27 * MM;
  const textWidthBeside = qrPayload ? g.width - qrSize - 14 : g.width;
  const wrapText = (text, width) => (text ? wrap(text, FONTS.regular, body, width) : []);
  const introLines = wrapText(intro, g.width);
  const noteLines = notes.flatMap((n) => wrap(n, FONTS.bold, body - 0.5, g.width));
  const payLines = wrapText(payText, textWidthBeside);
  const closingLines = wrapText(closing, textWidthBeside);
  const paymentHeight = Math.max(
    qrPayload ? qrSize + 12 : 0,
    (payLines.length + closingLines.length) * lineGap + (closingLines.length ? 8 : 0),
  );
  const tailHeight =
    totalsHeight + 10 + (noteLines.length ? noteLines.length * lineGap + 8 : 0) + paymentHeight + 6;

  // ---------- pages ----------
  let page = null;
  let y = 0;
  const pages = [];

  const footer = (p) => {
    const top = g.footerTop;
    p.line(g.left, top - 6, g.right, top - 6, { stroke: LINE, lineWidth: 0.5 });
    const colW = g.width / 3;
    footerCols.forEach((col, i) => {
      col.slice(0, 5).forEach((text, j) => {
        const shown = wrap(text, FONTS.regular, 7, colW - 6, 1)[0];
        p.text(shown, g.left + i * colW, top + 4 + j * 8.6, { size: 7, colour: MUTED });
      });
    });
  };

  const marks = (p) => {
    if (layout !== 'din') return;
    // Fold marks at 105 mm and 210 mm, punch mark at 148.5 mm (DIN 5008 form B).
    for (const at of [105, 210])
      p.line(4 * MM, at * MM, 9 * MM, at * MM, { stroke: MUTED, lineWidth: 0.4 });
    p.line(4 * MM, 148.5 * MM, 11 * MM, 148.5 * MM, { stroke: MUTED, lineWidth: 0.4 });
  };

  const drawLogo = (p, x, top, maxW, maxH, alignRight) => {
    if (!logoImage) return 0;
    const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height);
    const w = logoImage.width * scale;
    const h = logoImage.height * scale;
    p.image(logoImage, alignRight ? x - w : x, top, w, h);
    return h;
  };

  const metaBlock = (p, x, top, valueRight) => {
    meta.forEach(([label, value], i) => {
      p.text(label, x, top + i * (body + 4), { size: body - 0.5, colour: MUTED });
      p.text(String(value), valueRight, top + i * (body + 4), {
        size: body - 0.5,
        font: FONTS.bold,
        align: 'right',
      });
    });
    return meta.length * (body + 4);
  };

  const firstHeader = (p) => {
    if (layout === 'din') {
      drawLogo(p, g.right, 12 * MM, 60 * MM, 22 * MM, true);
      // Address window: 85 × 45 mm from 45 mm; return address in the top 5 mm of it.
      const winTop = 45 * MM;
      p.text(wrap(sellerLine, FONTS.regular, 6.5, 80 * MM, 1)[0] ?? '', 20 * MM, winTop + 8, {
        size: 6.5,
        colour: MUTED,
      });
      p.line(20 * MM, winTop + 10.5, 105 * MM, winTop + 10.5, { stroke: LINE, lineWidth: 0.4 });
      addressLines.slice(0, 6).forEach((line, i) => {
        p.text(line, 20 * MM, winTop + 8.5 * MM + 10 + i * 12, { size: 10 });
      });
      // Information block right of the window (from 125 mm, at 50 mm).
      metaBlock(p, 125 * MM, 50 * MM, g.right);
      p.text(`${title} ${invoice.number ?? ''}`.trim(), g.left, 103 * MM, {
        size: 14,
        font: FONTS.bold,
      });
      return 112 * MM;
    }
    if (layout === 'modern') {
      p.rect(0, 0, A4.width, 6 * MM, { fill: ACCENT });
      const logoH = drawLogo(p, g.left, 14 * MM, 55 * MM, 18 * MM, false);
      p.text(title, g.right, 22 * MM, {
        size: 24,
        font: FONTS.bold,
        colour: ACCENT,
        align: 'right',
      });
      p.text(invoice.number ?? t('doc.draft'), g.right, 22 * MM + 16, {
        size: 11,
        colour: MUTED,
        align: 'right',
      });
      let top = Math.max(14 * MM + logoH, 34 * MM) + 8;
      if (!logoImage) {
        p.text(seller.name ?? '', g.left, 22 * MM, { size: 13, font: FONTS.bold });
        top = 34 * MM + 8;
      }
      p.text(sellerLine, g.left, top, { size: 7, colour: MUTED });
      p.text(t('doc.billTo'), g.left, top + 18, { size: 7.5, colour: ACCENT, font: FONTS.bold });
      addressLines.slice(0, 6).forEach((line, i) => {
        p.text(line, g.left, top + 32 + i * 12.5, {
          size: 10.5,
          font: i === 0 ? FONTS.bold : FONTS.regular,
        });
      });
      const used = metaBlock(p, g.left + g.width * 0.56, top + 18, g.right);
      return top + 32 + Math.max(addressLines.length * 12.5, used) + 18;
    }
    // compact
    const logoH = drawLogo(p, g.right, 12 * MM, 45 * MM, 14 * MM, true);
    p.text(seller.name ?? '', g.left, 16 * MM, { size: 11, font: FONTS.bold });
    p.text(sellerLine, g.left, 16 * MM + 11, { size: 7, colour: MUTED });
    const top = Math.max(16 * MM + 26, 12 * MM + logoH + 10);
    addressLines.slice(0, 6).forEach((line, i) => {
      p.text(line, g.left, top + 12 + i * 11.5, {
        size: 9.5,
        font: i === 0 ? FONTS.bold : FONTS.regular,
      });
    });
    const used = metaBlock(p, g.left + g.width * 0.55, top + 12, g.right);
    const below = top + 12 + Math.max(addressLines.length * 11.5, used) + 10;
    p.text(`${title} ${invoice.number ?? ''}`.trim(), g.left, below + 6, {
      size: 13,
      font: FONTS.bold,
    });
    return below + 16;
  };

  const tableHead = (p, top) => {
    if (layout === 'modern') p.rect(g.left, top, g.width, headHeight, { fill: TINT });
    else
      p.line(g.left, top + headHeight, g.right, top + headHeight, { stroke: INK, lineWidth: 0.8 });
    const base = top + rowPad + body;
    const style = {
      size: body - 1,
      font: FONTS.bold,
      colour: layout === 'modern' ? ACCENT : MUTED,
    };
    p.text(t('doc.pos'), cols.pos + (layout === 'modern' ? 4 : 0), base, style);
    p.text(t('doc.description'), cols.title, base, style);
    p.text(t('doc.quantity'), cols.qty, base, { ...style, align: 'right' });
    if (showRate) p.text(t('doc.rate'), cols.rate, base, { ...style, align: 'right' });
    p.text(t('doc.unitPrice'), cols.price, base, { ...style, align: 'right' });
    p.text(t('doc.amount'), cols.amount - (layout === 'modern' ? 4 : 0), base, {
      ...style,
      align: 'right',
    });
    return top + headHeight;
  };

  const drawRow = (p, row, top) => {
    const { line } = row;
    const base = top + rowPad + body;
    const shift = layout === 'modern' ? 4 : 0;
    p.text(String(row.index + 1), cols.pos + shift, base, { size: body, colour: MUTED });
    row.titleLines.forEach((text, i) => {
      p.text(text, cols.title, base + i * lineGap, { size: body, font: FONTS.bold });
    });
    row.extra.forEach((text, i) => {
      p.text(text, cols.title, base + row.titleLines.length * lineGap + i * (body - 1) * 1.3, {
        size: body - 1,
        colour: MUTED,
      });
    });
    const qty = `${formatQuantity(line.qty_milli, locale)}${line.unit ? ` ${line.unit}` : ''}`;
    p.text(qty, cols.qty, base, { size: body, align: 'right' });
    if (showRate) p.text(percent(line.tax_bp), cols.rate, base, { size: body, align: 'right' });
    p.text(fmt(line.price_cents), cols.price, base, { size: body, align: 'right' });
    p.text(fmt(lineNet(line)), cols.amount - shift, base, { size: body, align: 'right' });
    p.line(g.left, top + row.height, g.right, top + row.height, { stroke: LINE, lineWidth: 0.4 });
  };

  const newPage = () => {
    page = doc.addPage();
    pages.push(page);
    marks(page);
    footer(page);
    if (pages.length === 1) y = firstHeader(page);
    else {
      page.text(`${title} ${invoice.number ?? ''} · ${seller.name ?? ''}`, g.left, 18 * MM, {
        size: 8,
        colour: MUTED,
      });
      y = 24 * MM;
    }
  };

  newPage();
  const bottom = g.footerTop - 14;
  // Intro text.
  if (introLines.length) {
    introLines.forEach((text, i) => {
      page.text(text, g.left, y + body + i * lineGap, { size: body });
    });
    y += introLines.length * lineGap + 10;
  }
  y = tableHead(page, y);
  rows.forEach((row, i) => {
    const isLast = i === rows.length - 1;
    const need = row.height + (isLast ? tailHeight : 0);
    if (y + need > bottom && y + row.height <= bottom && isLast) {
      // The last row fits, the totals do not: keep the row here and move the rest.
      drawRow(page, row, y);
      y += row.height;
      return;
    }
    if (y + row.height > bottom) {
      page.text(t('doc.continued'), g.right, bottom + 4, {
        size: 7.5,
        colour: MUTED,
        align: 'right',
      });
      newPage();
      y = tableHead(page, y);
    }
    drawRow(page, row, y);
    y += row.height;
  });
  if (y + tailHeight > bottom) newPage();

  // Totals, right-aligned.
  y += 10;
  const labelX = g.left + g.width * 0.45;
  for (const [label, value] of totalsRows) {
    page.text(label, labelX, y + body, { size: body, colour: MUTED });
    page.text(value, g.right, y + body, { size: body, align: 'right' });
    y += body + 5;
  }
  page.line(labelX, y + 2, g.right, y + 2, { stroke: INK, lineWidth: 0.8 });
  if (layout === 'modern') page.rect(labelX, y + 4, g.right - labelX, body + 12, { fill: TINT });
  page.text(totalLabel, labelX + (layout === 'modern' ? 6 : 0), y + body + 9, {
    size: body + 1.5,
    font: FONTS.bold,
  });
  page.text(fmt(sum.gross), g.right - (layout === 'modern' ? 6 : 0), y + body + 9, {
    size: body + 1.5,
    font: FONTS.bold,
    align: 'right',
    colour: layout === 'modern' ? ACCENT : INK,
  });
  y += body + 20;

  if (noteLines.length) {
    y += 6;
    noteLines.forEach((text, i) => {
      page.text(text, g.left, y + body + i * lineGap, { size: body - 0.5, font: FONTS.bold });
    });
    y += noteLines.length * lineGap + 4;
  }

  // Payment text and QR code.
  y += 6;
  let textY = y;
  payLines.forEach((text) => {
    textY += lineGap;
    page.text(text, g.left, textY, { size: body });
  });
  if (closingLines.length) {
    textY += 8;
    closingLines.forEach((text) => {
      textY += lineGap;
      page.text(text, g.left, textY, { size: body });
    });
  }
  if (qrPayload) {
    const matrix = qrMatrix(qrPayload);
    const x = g.right - qrSize;
    const cell = qrSize / (matrix.length + 2);
    const rects = [];
    matrix.forEach((row, r) => {
      let start = -1;
      for (let c = 0; c <= row.length; c += 1) {
        if (c < row.length && row[c]) {
          if (start < 0) start = c;
        } else if (start >= 0) {
          rects.push([
            x + (start + 1) * cell,
            y + (r + 1) * cell,
            (c - start) * cell + 0.01,
            cell + 0.01,
          ]);
          start = -1;
        }
      }
    });
    page.rects(rects, INK);
    page.text(t('doc.scanToPay'), x + qrSize / 2, y + qrSize + 8, {
      size: 6.5,
      colour: MUTED,
      align: 'center',
    });
  }

  // Page numbers when there is more than one page.
  if (pages.length > 1)
    pages.forEach((p, i) => {
      p.text(t('doc.page', { page: i + 1, pages: pages.length }), g.right, g.footerTop - 10, {
        size: 7,
        colour: MUTED,
        align: 'right',
      });
    });

  return doc.build(now);
}

function safeJpeg(doc, bytes) {
  try {
    return doc.addJpeg(bytes);
  } catch {
    return null;
  }
}

/** The name of a country in the document's language ("Schweiz", "Switzerland"). */
export function regionName(code, locale) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
