// Lays a wishlist out on A4 pages with pdf.js: a header, then the wishes as cards in two columns,
// as many rows per page as fit. A card holds the picture (or the initial on a tint), title, price,
// priority, a short note and a link to the shop. Sorted by category, the cards come in sections
// with a heading per category (repeated with "continued" after a page break). Every card has a
// check box in its corner: ticked in a PDF viewer, it marks the wish as taken, so people without
// an account can see what is already taken once the file is passed on. Pure: it gets the data and the finished
// texts, and returns the bytes of the PDF.
import { A4, boxOps, FONTS, PdfDocument, textWidth, wrap } from './pdf.js';

const INK = '#17160f';
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
const SECTION = { size: 13, height: 30 };
const TICK = 13; // the circle in a card's corner that shows it can be ticked

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
 * @param {{ none: string, continued: string }} [input.sections]  sections per category (the
 *   wishes come sorted by it): the heading of wishes without one, and the word after a heading
 *   that is repeated on the next page
 * @param {{ hint: string }} [input.crossOut]  every card can be ticked off in a PDF viewer (the
 *   circle in its corner): the line under the title that says so
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
  sections,
  crossOut,
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
  if (crossOut?.hint && wishes.length > 0) {
    for (const line of wrap(crossOut.hint, FONTS.italic, 8.5, right - MARGIN, 2)) {
      top += 2;
      page.text(line, MARGIN, top + 8, { font: FONTS.italic, size: 8.5, colour: MUTED });
      top += 11;
    }
    top += 2;
  }
  page.line(MARGIN, top, right, top, { stroke: RULE });
  top += 12;

  if (wishes.length === 0 && empty)
    page.text(empty, MARGIN, top + 12, { font: FONTS.italic, size: 11, colour: MUTED });

  // In sections the heading names the category: the cards leave it out.
  const cards = wishes.map((wish, index) => ({
    ...layoutCard(sections ? { ...wish, category: '' } : wish, cardWidth),
    wish,
    index,
  }));
  // Consecutive wishes with the same category form a section (one section without headings).
  const groups = [];
  for (const card of cards) {
    const key = sections ? (card.wish.category ?? '').trim() : '';
    const last = groups.at(-1);
    if (last && last.key === key) last.cards.push(card);
    else groups.push({ key, cards: [card] });
  }
  for (const group of groups) {
    const heading = sections ? group.key || sections.none : '';
    let first = true;
    for (let at = 0; at < group.cards.length; at += COLUMNS) {
      const row = group.cards.slice(at, at + COLUMNS);
      const rowHeight = Math.max(...row.map((card) => card.height));
      // A heading never stands alone at the bottom of a page: it moves with its first row.
      const needed = rowHeight + (heading && first ? SECTION.height : 0);
      let continued = false;
      if (top + needed > A4.height - BOTTOM) {
        page = doc.addPage();
        top = TOP;
        continued = !first;
      }
      if (heading && (first || continued)) {
        drawSection(page, heading, group.cards.length, continued ? sections?.continued : '', top);
        top += SECTION.height;
      }
      first = false;
      row.forEach((card, column) => {
        const x = MARGIN + column * (cardWidth + COLUMN_GAP);
        drawCard(doc, page, card, x, top, rowHeight);
        if (crossOut) tickable(page, card, x, top);
      });
      top += rowHeight + ROW_GAP;
    }
    top += sections ? 6 : 0;
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

/** A category heading: an accent bar, the name, how many wishes it holds. */
function drawSection(page, name, count, continued, top) {
  page.roundRect(MARGIN, top + 4, 3, 16, 1.5, { fill: ACCENT });
  const label = continued ? `${name} (${continued})` : name;
  const width = page.text(label, MARGIN + 10, top + 16, {
    font: FONTS.bold,
    size: SECTION.size,
    colour: INK,
  });
  page.text(String(count), MARGIN + 10 + width + 8, top + 16, { size: 10, colour: MUTED });
}

/**
 * The card's check box: only the circle in its top right corner, so the rest of the card (and the
 * shop link above all) stays clickable in every viewer. Unticked an empty ring, ticked a filled
 * circle with a white check.
 */
function tickable(page, card, x, top) {
  const left = x + card.width - PAD - TICK;
  const boxTop = top + PAD;
  page.roundRect(left, boxTop, TICK, TICK, TICK / 2, { stroke: RULE, lineWidth: 1 });
  // In the box's own coordinates: origin at the bottom left, TICK × TICK.
  const on = [
    boxOps.pill(0, 0, TICK, TICK, ACCENT),
    boxOps.line(3.5, TICK / 2 - 0.5, TICK / 2 - 0.5, 3.5, '#ffffff', 1.6),
    boxOps.line(TICK / 2 - 0.5, 3.5, TICK - 3, TICK - 3.5, '#ffffff', 1.6),
  ].join('\n');
  page.checkbox(`wish-${card.index + 1}`, left, boxTop, TICK, TICK, on);
}
