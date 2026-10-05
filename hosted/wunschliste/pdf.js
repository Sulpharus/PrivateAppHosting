// A small PDF writer for the wishlist export: A4 pages, the standard fonts (Helvetica, bold,
// oblique, WinAnsi), filled and rounded rectangles, JPEG pictures, links. No library: the app is
// plain files, and everything it needs from a PDF fits in this one. Text is measured with the fonts'
// own widths, so lines wrap where they really end.

// ---------- fonts ----------
// Advance widths (1/1000 em) of the characters 32..126 in Helvetica and Helvetica-Bold.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
export const FONTS = {
  regular: { id: 'F1', name: 'Helvetica', widths: REGULAR },
  bold: { id: 'F2', name: 'Helvetica-Bold', widths: BOLD },
  italic: { id: 'F3', name: 'Helvetica-Oblique', widths: REGULAR },
};

// Characters outside Latin-1 that WinAnsi (Windows-1252) has, with their byte.
const WIN_ANSI = new Map([
  ['€', 0x80],
  ['‚', 0x82],
  ['„', 0x84],
  ['…', 0x85],
  ['‘', 0x91],
  ['’', 0x92],
  ['“', 0x93],
  ['”', 0x94],
  ['•', 0x95],
  ['–', 0x96],
  ['—', 0x97],
  ['™', 0x99],
  ['Š', 0x8a],
  ['š', 0x9a],
  ['Ž', 0x8e],
  ['ž', 0x9e],
  ['Œ', 0x8c],
  ['œ', 0x9c],
  ['Ÿ', 0x9f],
]);

/** The WinAnsi byte of a character; `?` for what the standard fonts cannot show (emoji, …). */
export function winAnsi(char) {
  const code = char.codePointAt(0) ?? 63;
  if (code === 10 || code === 9) return 32;
  if (code >= 32 && code <= 126) return code;
  if (code >= 160 && code <= 255) return code;
  return WIN_ANSI.get(char) ?? 63;
}

/** Width of a character in 1/1000 em. Accented letters measure like their base letter. */
function charWidth(font, char) {
  const code = char.codePointAt(0) ?? 63;
  if (code >= 32 && code <= 126) return font.widths[code - 32];
  if (char === 'ß') return font === FONTS.bold ? 611 : 611;
  if (char === '€') return 556;
  const base = char.normalize('NFD')[0] ?? '?';
  const baseCode = base.codePointAt(0) ?? 63;
  if (baseCode >= 32 && baseCode <= 126 && base !== char) return font.widths[baseCode - 32];
  if (code === 0xa0) return 278;
  if (WIN_ANSI.has(char))
    return char === '…' ? 1000 : char === '–' ? 556 : char === '—' ? 1000 : 556;
  return 556;
}

/** Text width in points. */
export function textWidth(text, font, size) {
  let total = 0;
  for (const char of text) total += charWidth(font, char);
  return (total * size) / 1000;
}

/** Breaks a text into lines of at most `width` points (long words are cut). */
export function wrap(text, font, size, width, maxLines = Number.POSITIVE_INFINITY) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (textWidth(rest, font, size) > width) {
        // A word longer than a line: as many characters as fit.
        let cut = rest.length;
        while (cut > 1 && textWidth(rest.slice(0, cut), font, size) > width) cut -= 1;
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      const candidate = line ? `${line} ${rest}` : rest;
      if (textWidth(candidate, font, size) <= width) line = candidate;
      else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  while (lines.length > 1 && lines.at(-1) === '') lines.pop();
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1] ?? '';
    while (last && textWidth(`${last}…`, font, size) > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

// ---------- JPEG ----------
/** Width, height and colour components of a JPEG (from its start-of-frame marker). */
export function jpegInfo(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG');
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1];
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0xff
    ) {
      at += marker === 0xff ? 1 : 2;
      continue;
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    // SOF0..SOF15 except DHT (c4), JPG (c8) and DAC (cc)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: (bytes[at + 5] << 8) | bytes[at + 6],
        width: (bytes[at + 7] << 8) | bytes[at + 8],
        components: bytes[at + 9],
      };
    }
    at += 2 + length;
  }
  throw new Error('JPEG without size');
}

// ---------- document ----------
const latin1 = (text) => {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
};
const num = (n) => (Math.round(n * 100) / 100).toString();
const hex = (colour) => {
  const value = Number.parseInt(colour.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => num(c / 255)).join(' ');
};
const escapeText = (text) => {
  let out = '';
  for (const char of text) {
    const byte = winAnsi(char);
    const c = String.fromCharCode(byte);
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return out;
};

export const A4 = { width: 595.28, height: 841.89 };

/** One page: drawing commands in a coordinate system with the origin at the top left, in points. */
class Page {
  constructor(doc) {
    this.doc = doc;
    this.ops = [];
    this.links = [];
    this.imageIds = new Set();
  }

  y(top) {
    return A4.height - top;
  }

  rect(x, top, w, h, { fill, stroke, lineWidth = 0.75 } = {}) {
    this.ops.push(
      `${this.paint(fill, stroke, lineWidth)}${num(x)} ${num(this.y(top + h))} ${num(w)} ${num(h)} re ${this.op(fill, stroke)}`,
    );
  }

  roundRect(x, top, w, h, r, { fill, stroke, lineWidth = 0.75 } = {}) {
    this.ops.push(
      `${this.paint(fill, stroke, lineWidth)}${this.roundPath(x, top, w, h, r)} ${this.op(fill, stroke)}`,
    );
  }

  line(x1, top1, x2, top2, { stroke = '#d9d6cc', lineWidth = 0.75 } = {}) {
    this.ops.push(
      `${hex(stroke)} RG ${num(lineWidth)} w ${num(x1)} ${num(this.y(top1))} m ${num(x2)} ${num(this.y(top2))} l S`,
    );
  }

  paint(fill, stroke, lineWidth) {
    return `${fill ? `${hex(fill)} rg ` : ''}${stroke ? `${hex(stroke)} RG ${num(lineWidth)} w ` : ''}`;
  }

  op(fill, stroke) {
    return fill && stroke ? 'B' : fill ? 'f' : 'S';
  }

  roundPath(x, top, w, h, r) {
    const k = 0.5523 * r;
    const bottom = this.y(top + h);
    const right = x + w;
    const t = this.y(top);
    return [
      `${num(x + r)} ${num(bottom)} m`,
      `${num(right - r)} ${num(bottom)} l`,
      `${num(right - r + k)} ${num(bottom)} ${num(right)} ${num(bottom + r - k)} ${num(right)} ${num(bottom + r)} c`,
      `${num(right)} ${num(t - r)} l`,
      `${num(right)} ${num(t - r + k)} ${num(right - r + k)} ${num(t)} ${num(right - r)} ${num(t)} c`,
      `${num(x + r)} ${num(t)} l`,
      `${num(x + r - k)} ${num(t)} ${num(x)} ${num(t - r + k)} ${num(x)} ${num(t - r)} c`,
      `${num(x)} ${num(bottom + r)} l`,
      `${num(x)} ${num(bottom + r - k)} ${num(x + r - k)} ${num(bottom)} ${num(x + r)} ${num(bottom)} c h`,
    ].join(' ');
  }

  /** Text with its baseline at `top` (distance from the top edge). Returns the width in points. */
  text(text, x, top, { font = FONTS.regular, size = 10, colour = '#17160f', align = 'left' } = {}) {
    const width = textWidth(text, font, size);
    const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    this.doc.fontsUsed.add(font.id);
    this.ops.push(
      `BT ${hex(colour)} rg /${font.id} ${num(size)} Tf ${num(left)} ${num(this.y(top))} Td (${escapeText(text)}) Tj ET`,
    );
    return width;
  }

  /** A JPEG (an image registered with `doc.addJpeg`) in a box, rounded, scaled to fill it. */
  image(image, x, top, w, h, radius = 0) {
    this.imageIds.add(image.id);
    // Cover the box: the picture is scaled to fill it and the overhang is clipped.
    const scale = Math.max(w / image.width, h / image.height);
    const iw = image.width * scale;
    const ih = image.height * scale;
    const ix = x + (w - iw) / 2;
    const itop = top + (h - ih) / 2;
    this.ops.push(
      `q ${this.roundPath(x, top, w, h, radius)} W n ${num(iw)} 0 0 ${num(ih)} ${num(ix)} ${num(this.y(itop + ih))} cm /${image.id} Do Q`,
    );
  }

  /** A clickable area that opens `url`. */
  link(url, x, top, w, h) {
    this.links.push({ url, rect: [x, this.y(top + h), x + w, this.y(top)] });
  }
}

export class PdfDocument {
  constructor({ title = '', author = '', subject = '' } = {}) {
    this.info = { title, author, subject };
    this.pages = [];
    this.images = [];
    this.fontsUsed = new Set();
  }

  addPage() {
    const page = new Page(this);
    this.pages.push(page);
    return page;
  }

  /** Registers JPEG bytes; the result is passed to `page.image`. */
  addJpeg(bytes) {
    const info = jpegInfo(bytes);
    if (info.components !== 3 && info.components !== 1) throw new Error('JPEG colour model');
    const image = { id: `Im${this.images.length + 1}`, bytes, ...info };
    this.images.push(image);
    return image;
  }

  /** The finished file. */
  build(now = new Date()) {
    const objects = []; // index = object number - 1; each is an array of Uint8Array parts
    const add = (...parts) => {
      objects.push(parts.map((p) => (typeof p === 'string' ? latin1(p) : p)));
      return objects.length;
    };
    const reserve = () => {
      objects.push(null);
      return objects.length;
    };
    const set = (id, ...parts) => {
      objects[id - 1] = parts.map((p) => (typeof p === 'string' ? latin1(p) : p));
    };

    const catalog = reserve();
    const pagesRoot = reserve();
    const fontIds = {};
    for (const font of Object.values(FONTS))
      fontIds[font.id] = add(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${font.name} /Encoding /WinAnsiEncoding >>`,
      );
    const imageIds = {};
    for (const image of this.images)
      imageIds[image.id] = add(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /${image.components === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
        image.bytes,
        '\nendstream',
      );

    const pageIds = [];
    for (const page of this.pages) {
      const content = latin1(page.ops.join('\n'));
      const contentId = add(`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream');
      const annots = page.links.map((link) =>
        add(
          `<< /Type /Annot /Subtype /Link /Rect [${link.rect.map(num).join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${link.url.replace(/[^\x21-\x7e]/g, '').replace(/[()\\]/g, (c) => `\\${c}`)}) >> >>`,
        ),
      );
      const fonts = Object.values(fontIds)
        .map((id, i) => `/F${i + 1} ${id} 0 R`)
        .join(' ');
      const xobjects = [...page.imageIds].map((id) => `/${id} ${imageIds[id]} 0 R`).join(' ');
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${num(A4.width)} ${num(A4.height)}] /Resources << /Font << ${fonts} >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} >> /Contents ${contentId} 0 R${annots.length ? ` /Annots [${annots.map((id) => `${id} 0 R`).join(' ')}]` : ''} >>`,
        ),
      );
    }
    set(
      pagesRoot,
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    );
    set(catalog, `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`);
    const stamp = `D:${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
    const info = add(
      `<< /Title (${escapeText(this.info.title)}) /Author (${escapeText(this.info.author)}) /Subject (${escapeText(this.info.subject)}) /Producer (MiniNode) /CreationDate (${stamp}) >>`,
    );

    const chunks = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
    let length = chunks[0].length;
    const offsets = [];
    objects.forEach((parts, index) => {
      offsets.push(length);
      const head = latin1(`${index + 1} 0 obj\n`);
      const tail = latin1('\nendobj\n');
      for (const part of [head, ...parts, tail]) {
        chunks.push(part);
        length += part.length;
      }
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
    for (const offset of offsets) xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    chunks.push(
      latin1(
        `${xref.join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`,
      ),
    );
    const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
}
