import { describe, expect, it } from 'vitest';
import { FONTS, jpegInfo, PdfDocument, textWidth, winAnsi, wrap } from '../pdf.js';
import { buildWishlistPdf } from '../wishlist-pdf.js';

// A 40 x 30 JPEG made by a browser canvas, the kind of file the app embeds.
const JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAeACgDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAgG/8QAJxAAAQIEBQQDAQAAAAAAAAAAAAECAwUHIQQGEhMUCDeEtBdWpNP/xAAXAQEBAQEAAAAAAAAAAAAAAAAEAwUG/8QAIhEAAQQCAgEFAAAAAAAAAAAAAgABAxEEEgUTITFRYeHw/9oADAMBAAIRAxEAPwDHgFedPPZ6R+R7EQyYYuwqtczi4/ebjdKQwX2YDqG7PTzx/YhlyxNRd7TJON0By29Pj7UhgAGstCjaNVLyTl+m0qlE3nfGxuH3t2FxYz9OqM9yXaxUWzkWyk5ApHI8b2ytBOUBbCq8+ZabfY/xYj+ZkKy1LyTmCm01lEonfJxuI2dqFxYzNWmMxy3cxESzVW6k5AqWUZM7UknyMpi4uzef3ugADIC//9k=',
  ),
  (c) => c.charCodeAt(0),
);
const text = (bytes) => new TextDecoder('latin1').decode(bytes);

/** Checks the cross-reference table the way a reader does: every offset points at its object. */
function checkStructure(bytes) {
  const s = text(bytes);
  expect(s.startsWith('%PDF-1.4')).toBe(true);
  expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)?.[1]);
  expect(s.slice(start, start + 4)).toBe('xref');
  const entries = [...s.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  entries.forEach((offset, index) => {
    const head = `${index + 1} 0 obj`;
    expect(s.slice(offset, offset + head.length)).toBe(head);
  });
  return { s, objects: entries.length };
}

describe('pdf writer', () => {
  it('measures with the fonts own widths and wraps long text and words', () => {
    expect(textWidth('Hello', FONTS.regular, 10)).toBeCloseTo(
      ((722 + 556 + 222 + 222 + 556) * 10) / 1000,
    );
    expect(textWidth('Ä', FONTS.regular, 10)).toBe(textWidth('A', FONTS.regular, 10));
    const lines = wrap('ein sehr langer Text über mehrere Zeilen', FONTS.regular, 10, 80);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(textWidth(line, FONTS.regular, 10)).toBeLessThanOrEqual(80);
    // A word wider than the line is cut, not overflowed.
    for (const line of wrap('Donaudampfschifffahrtsgesellschaftskapitän', FONTS.bold, 12, 90))
      expect(textWidth(line, FONTS.bold, 12)).toBeLessThanOrEqual(90);
    // Too many lines end in an ellipsis.
    const cut = wrap('a b c d e f g h i j k l m n o p', FONTS.regular, 10, 20, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1]).toMatch(/…$/);
  });

  it('maps characters to WinAnsi and replaces what the standard fonts cannot show', () => {
    expect(winAnsi('A')).toBe(65);
    expect(winAnsi('ä')).toBe(0xe4);
    expect(winAnsi('€')).toBe(0x80);
    expect(winAnsi('„')).toBe(0x84);
    expect(winAnsi('😀')).toBe(63);
  });

  it('reads the size of a JPEG and refuses other data', () => {
    expect(jpegInfo(JPEG)).toEqual({ width: 40, height: 30, components: 3 });
    expect(() => jpegInfo(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it('writes a valid file with pages, a picture, text and a link', () => {
    const doc = new PdfDocument({ title: 'Test (1)', author: 'Ä' });
    const image = doc.addJpeg(JPEG);
    const page = doc.addPage();
    page.rect(10, 10, 100, 40, { fill: '#b3264f' });
    page.image(image, 10, 10, 100, 40, 8);
    page.text('Grüße (aus) \\ Wien', 20, 100, { font: FONTS.bold });
    page.link('https://example.com/a b', 20, 90, 80, 12);
    doc.addPage();
    const { s, objects } = checkStructure(doc.build(new Date('2026-10-05T10:00:00Z')));
    expect(objects).toBeGreaterThan(8);
    expect(s).toContain('/Count 2');
    expect(s).toContain('/Filter /DCTDecode');
    expect(s).toContain('/Width 40 /Height 30');
    expect(s).toContain('/Subtype /Link');
    // The address keeps no space; brackets and backslashes in text are escaped.
    expect(s).toContain('/URI (https://example.com/ab)');
    expect(s).toContain('Gr\xfc\xdfe \\(aus\\) \\\\ Wien');
    expect(s).toContain('/CreationDate (D:20261005100000Z)');
  });
});

describe('wishlist pdf', () => {
  const wish = (n, extra = {}) => ({
    title: `Wunsch ${n}`,
    price: '10,00 €',
    priority: 2,
    priorityLabel: 'Normal',
    note: 'Eine Notiz',
    url: `https://example.com/${n}`,
    shop: 'example.com',
    linkLabel: 'Zum Angebot',
    image: null,
    ...extra,
  });
  const build = (wishes) =>
    buildWishlistPdf({
      title: 'Wunschliste',
      subtitle: `Lena · ${wishes.length} Wünsche`,
      wishes,
      brand: 'MiniNode',
      pageLabel: (p, n) => `Seite ${p} von ${n}`,
      empty: 'Noch keine Wünsche',
      now: new Date('2026-10-05T10:00:00Z'),
    });

  it('breaks into pages and numbers them', () => {
    const { s } = checkStructure(build(Array.from({ length: 30 }, (_, i) => wish(i + 1))));
    const pages = Number(/\/Count (\d+)/.exec(s)?.[1]);
    expect(pages).toBeGreaterThanOrEqual(4);
    expect(s).toContain(`(Seite 1 von ${pages})`);
    expect(s).toContain(`(Seite ${pages} von ${pages})`);
  });

  it('draws the picture when there is one, and the initial when there is none', () => {
    const withPicture = text(build([wish(1, { image: JPEG })]));
    expect(withPicture).toContain('/Im1 Do');
    expect(withPicture).toContain('/Subtype /Link');
    const without = text(build([wish(1)]));
    expect(without).not.toContain('/Im1');
    expect(without).toContain('(W) Tj');
  });

  it('shows the priority as a tag only when it is not the normal one', () => {
    expect(text(build([wish(1, { priority: 1, priorityLabel: 'Sehr gern' })]))).toContain(
      '(Sehr gern)',
    );
    expect(text(build([wish(1)]))).not.toContain('(Normal)');
  });

  it('is a valid one-page file for an empty list', () => {
    const { s } = checkStructure(build([]));
    expect(s).toContain('/Count 1');
    expect(s).toContain('(Noch keine W\xfcnschen)'.replace('nschen', 'nsche'));
  });
});
