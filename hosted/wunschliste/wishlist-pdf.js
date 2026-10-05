// Lays a wishlist out on A4 pages with pdf.js: a header, then one card per wish with its picture (or
// the initial on a tint), title, price, priority, note and a link to the shop. Pure: it gets the
// data and the finished texts, and returns the bytes of the PDF.
import { A4, FONTS, PdfDocument, textWidth, wrap } from './pdf.js';

const INK = '#17160f';
const MUTED = '#6b6a63';
const ACCENT = '#b3264f';
const TINT = '#f6e6ea';
const RULE = '#e4e0d6';
const LINK = '#1f5fbf';

const MARGIN = 44;
const TOP = 48;
const BOTTOM = 54; // room for the footer
const PICTURE = 88;
const GAP = 16;

/**
 * @param {object} input
 * @param {string} input.title      big title of the first page
 * @param {string} input.subtitle   line under it (who, how many, when)
 * @param {{ title: string, note?: string, price?: string, priority?: number, priorityLabel?: string,
 *   shop?: string, url?: string, linkLabel?: string, image?: Uint8Array | null }[]} input.wishes
 * @param {string} input.brand      footer, left
 * @param {(page: number, pages: number) => string} input.pageLabel   footer, right
 * @param {string} [input.empty]    text for a list without wishes
 * @param {string} [input.author]
 * @param {Date} [input.now]
 */
export function buildWishlistPdf({
  title,
  subtitle,
  wishes,
  brand,
  pageLabel,
  empty,
  author,
  now,
}) {
  const doc = new PdfDocument({ title, author: author ?? '', subject: subtitle });
  const contentWidth = A4.width - 2 * MARGIN;
  const right = A4.width - MARGIN;
  let page = doc.addPage();
  let top = TOP;

  // Header: a short accent bar, the title, the line under it.
  page.roundRect(MARGIN, top, 44, 5, 2.5, { fill: ACCENT });
  top += 32;
  page.text(title, MARGIN, top, { font: FONTS.bold, size: 27 });
  top += 22;
  page.text(subtitle, MARGIN, top, { size: 11, colour: MUTED });
  top += 22;
  page.line(MARGIN, top, right, top, { stroke: RULE });
  top += 18;

  if (wishes.length === 0 && empty)
    page.text(empty, MARGIN, top + 12, { font: FONTS.italic, size: 11, colour: MUTED });

  for (const wish of wishes) {
    const image = wish.image ? doc.addJpeg(wish.image) : null;
    const textLeft = MARGIN + PICTURE + GAP;
    const textWidthMax = right - textLeft;

    const price = wish.price ?? '';
    const priceWidth = price ? textWidth(price, FONTS.bold, 13) + 14 : 0;
    const titleLines = wrap(wish.title, FONTS.bold, 13.5, textWidthMax - priceWidth, 3);
    const noteLines = wish.note ? wrap(wish.note, FONTS.italic, 10, textWidthMax, 6) : [];
    const chip = wish.priorityLabel && wish.priority !== 2 ? wish.priorityLabel : '';
    const shopLine = wish.url
      ? `${wish.linkLabel ?? ''}${wish.shop ? ` · ${wish.shop}` : ''}`.replace(/^ · /, '')
      : '';

    // Height of the text column: title, chip, note, link.
    let textHeight = titleLines.length * 17;
    if (chip) textHeight += 22;
    if (noteLines.length) textHeight += 6 + noteLines.length * 13.5;
    if (shopLine) textHeight += 8 + 13;
    const cardHeight = Math.max(PICTURE, textHeight) + 22;

    if (top + cardHeight > A4.height - BOTTOM) {
      page = doc.addPage();
      top = TOP;
    }
    const cardTop = top;

    // Picture, or the initial on a tint.
    if (image) page.image(image, MARGIN, cardTop, PICTURE, PICTURE, 10);
    else {
      page.roundRect(MARGIN, cardTop, PICTURE, PICTURE, 10, { fill: TINT });
      const initial = ([...wish.title.trim()][0] ?? '?').toUpperCase();
      page.text(initial, MARGIN + PICTURE / 2, cardTop + PICTURE / 2 + 11, {
        font: FONTS.bold,
        size: 32,
        colour: ACCENT,
        align: 'center',
      });
    }

    let y = cardTop + 14;
    for (const line of titleLines) {
      page.text(line, textLeft, y, { font: FONTS.bold, size: 13.5 });
      y += 17;
    }
    if (price)
      page.text(price, right, cardTop + 14, { font: FONTS.bold, size: 13, align: 'right' });
    if (chip) {
      const chipWidth = textWidth(chip, FONTS.bold, 8.5) + 14;
      const strong = wish.priority === 1;
      page.roundRect(textLeft, y - 7, chipWidth, 15, 7.5, { fill: strong ? ACCENT : '#ece9df' });
      page.text(chip, textLeft + 7, y + 3.6, {
        font: FONTS.bold,
        size: 8.5,
        colour: strong ? '#ffffff' : MUTED,
      });
      y += 22;
    }
    if (noteLines.length) {
      y += 2;
      for (const line of noteLines) {
        page.text(line, textLeft, y + 4, { font: FONTS.italic, size: 10, colour: MUTED });
        y += 13.5;
      }
    }
    if (shopLine) {
      y += 10;
      const width = page.text(shopLine, textLeft, y + 2, { size: 9.5, colour: LINK });
      page.line(textLeft, y + 4.2, textLeft + width, y + 4.2, { stroke: LINK, lineWidth: 0.5 });
      page.link(wish.url, textLeft, y - 9, width, 15);
    }

    top = cardTop + cardHeight;
    page.line(MARGIN, top - 8, right, top - 8, { stroke: RULE });
  }

  // Footer on every page, when the number of pages is known.
  doc.pages.forEach((p, index) => {
    p.text(brand, MARGIN, A4.height - 30, { size: 8.5, colour: MUTED });
    p.text(pageLabel(index + 1, doc.pages.length), right, A4.height - 30, {
      size: 8.5,
      colour: MUTED,
      align: 'right',
    });
  });
  return doc.build(now);
}
