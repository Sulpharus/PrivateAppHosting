// Lays a wishlist out on A4 pages with pdf.js: a header, then the wishes as cards in two columns,
// as many rows per page as fit. A card holds the picture (or the initial on a tint), title, price,
// priority, a short note and a link to the shop. Pure: it gets the data and the finished texts, and
// returns the bytes of the PDF.
import { A4, FONTS, PdfDocument, textWidth, wrap } from './pdf.js';

const MUTED = '#6b6a63';
const ACCENT = '#b3264f';
const TINT = '#f6e6ea';
const RULE = '#e4e0d6';
const LINK = '#1f5fbf';

const MARGIN = 36;
const TOP = 40;
const BOTTOM = 46; // room for the footer
const COLUMNS = 2;
const COLUMN_GAP = 12;
const ROW_GAP = 10;
const PAD = 8;
const PICTURE = 66;
const GAP = 10;

const TITLE = { font: FONTS.bold, size: 10.5, line: 12.5, max: 2 };
const NOTE = { font: FONTS.italic, size: 8.5, line: 10.5, max: 2 };

/**
 * @param {object} input
 * @param {string} input.title      big title of the first page
 * @param {string} input.subtitle   line under it (who, how many, when)
 * @param {{ title: string, note?: string, price?: string, priority?: number, priorityLabel?: string,
 *   shop?: string, url?: string, linkLabel?: string, category?: string,
 *   image?: Uint8Array | null }[]} input.wishes
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
  const right = A4.width - MARGIN;
  const cardWidth = (right - MARGIN - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
  let page = doc.addPage();
  let top = TOP;

  // Header: a short accent bar, the title, the line under it.
  page.roundRect(MARGIN, top, 40, 4.5, 2.25, { fill: ACCENT });
  top += 28;
  page.text(title, MARGIN, top, { font: FONTS.bold, size: 22 });
  top += 18;
  page.text(subtitle, MARGIN, top, { size: 10, colour: MUTED });
  top += 14;
  page.line(MARGIN, top, right, top, { stroke: RULE });
  top += 12;

  if (wishes.length === 0 && empty)
    page.text(empty, MARGIN, top + 12, { font: FONTS.italic, size: 11, colour: MUTED });

  const cards = wishes.map((wish) => layoutCard(wish, cardWidth));
  for (let first = 0; first < cards.length; first += COLUMNS) {
    const row = cards.slice(first, first + COLUMNS);
    const rowHeight = Math.max(...row.map((card) => card.height));
    if (top + rowHeight > A4.height - BOTTOM) {
      page = doc.addPage();
      top = TOP;
    }
    row.forEach((card, column) => {
      drawCard(doc, page, card, MARGIN + column * (cardWidth + COLUMN_GAP), top, rowHeight);
    });
    top += rowHeight + ROW_GAP;
  }

  // Footer on every page, when the number of pages is known.
  doc.pages.forEach((p, index) => {
    p.text(brand, MARGIN, A4.height - 24, { size: 8, colour: MUTED });
    p.text(pageLabel(index + 1, doc.pages.length), right, A4.height - 24, {
      size: 8,
      colour: MUTED,
      align: 'right',
    });
  });
  return doc.build(now);
}

/** The lines of a card and its height, before anything is drawn. */
function layoutCard(wish, cardWidth) {
  const textWidthMax = cardWidth - 2 * PAD - PICTURE - GAP;
  const titleLines = wrap(wish.title, TITLE.font, TITLE.size, textWidthMax, TITLE.max);
  const price = wish.price ?? '';
  const chip = wish.priorityLabel && wish.priority !== 2 ? wish.priorityLabel : '';
  const category = wish.category ?? '';
  const noteLines = wish.note ? wrap(wish.note, NOTE.font, NOTE.size, textWidthMax, NOTE.max) : [];
  const shopLine = wish.url
    ? wrap(
        `${wish.linkLabel ?? ''}${wish.shop ? ` · ${wish.shop}` : ''}`.replace(/^ · /, ''),
        FONTS.regular,
        8.5,
        textWidthMax,
        1,
      )[0]
    : '';

  let textHeight = titleLines.length * TITLE.line;
  if (price || chip || category) textHeight += 15;
  if (noteLines.length) textHeight += 3 + noteLines.length * NOTE.line;
  if (shopLine) textHeight += 13;
  return {
    wish,
    titleLines,
    price,
    chip,
    category,
    noteLines,
    shopLine,
    textWidthMax,
    width: cardWidth,
    height: Math.max(PICTURE, textHeight) + 2 * PAD,
  };
}

function drawCard(doc, page, card, x, top, height) {
  const { wish } = card;
  page.roundRect(x, top, card.width, height, 8, { stroke: RULE });

  // Picture, or the initial on a tint.
  const picX = x + PAD;
  const picTop = top + PAD;
  if (wish.image) page.image(doc.addJpeg(wish.image), picX, picTop, PICTURE, PICTURE, 6);
  else {
    page.roundRect(picX, picTop, PICTURE, PICTURE, 6, { fill: TINT });
    const initial = ([...wish.title.trim()][0] ?? '?').toUpperCase();
    page.text(initial, picX + PICTURE / 2, picTop + PICTURE / 2 + 9, {
      font: FONTS.bold,
      size: 26,
      colour: ACCENT,
      align: 'center',
    });
  }

  const left = picX + PICTURE + GAP;
  let y = top + PAD + 9;
  for (const line of card.titleLines) {
    page.text(line, left, y, { font: TITLE.font, size: TITLE.size });
    y += TITLE.line;
  }

  if (card.price || card.chip || card.category) {
    let chipLeft = left;
    if (card.price) {
      chipLeft += page.text(card.price, left, y + 2, {
        font: FONTS.bold,
        size: 10,
        colour: ACCENT,
      });
      chipLeft += 8;
    }
    if (card.chip) {
      const chipWidth = textWidth(card.chip, FONTS.bold, 7.5) + 12;
      const strong = wish.priority === 1;
      page.roundRect(chipLeft, y - 7, chipWidth, 12, 6, { fill: strong ? ACCENT : '#ece9df' });
      page.text(card.chip, chipLeft + 6, y + 1.7, {
        font: FONTS.bold,
        size: 7.5,
        colour: strong ? '#ffffff' : MUTED,
      });
      chipLeft += chipWidth + 6;
    }
    if (card.category) {
      const room = left + card.textWidthMax - chipLeft;
      const label = wrap(card.category, FONTS.regular, 8, Math.max(room, 20), 1)[0] ?? '';
      if (room > 20) page.text(label, chipLeft, y + 1.7, { size: 8, colour: MUTED });
    }
    y += 15;
  }

  if (card.noteLines.length) {
    y += 1;
    for (const line of card.noteLines) {
      page.text(line, left, y, { font: NOTE.font, size: NOTE.size, colour: MUTED });
      y += NOTE.line;
    }
    y += 2;
  }

  if (card.shopLine) {
    y += 2;
    const width = page.text(card.shopLine, left, y, { size: 8.5, colour: LINK });
    page.line(left, y + 1.8, left + width, y + 1.8, { stroke: LINK, lineWidth: 0.5 });
    page.link(wish.url, left, y - 8, width, 12);
  }
}
