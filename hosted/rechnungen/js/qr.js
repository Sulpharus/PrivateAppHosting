// A QR code encoder for the payment code on invoices (EPC069-12 "GiroCode", read by banking apps in
// Germany and Austria). Byte mode, error correction level M as the standard asks, versions 1 to 15
// (up to 412 bytes; an EPC payload is at most 331). No library: the app is plain files.

// Error correction level M: [ec codewords per block, [blocks, data codewords per block], …].
const BLOCKS_M = [
  null,
  [10, [1, 16]],
  [16, [1, 28]],
  [26, [1, 44]],
  [18, [2, 32]],
  [24, [2, 43]],
  [16, [4, 27]],
  [18, [4, 31]],
  [22, [2, 38], [2, 39]],
  [22, [3, 36], [2, 37]],
  [26, [4, 43], [1, 44]],
  [30, [1, 50], [4, 51]],
  [22, [6, 36], [2, 37]],
  [22, [8, 37], [1, 38]],
  [24, [4, 40], [5, 41]],
  [24, [5, 41], [5, 42]],
];

const ALIGNMENT = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
];

// ---------- Reed-Solomon over GF(256) ----------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function ecCodewords(data, degree) {
  const gen = generator(degree);
  const rest = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = rest[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) rest[i + j] ^= mul(gen[j], factor);
  }
  return rest.slice(data.length);
}

// ---------- data ----------
const dataCapacity = (version) =>
  BLOCKS_M[version].slice(1).reduce((sum, [count, size]) => sum + count * size, 0);

function chooseVersion(length) {
  for (let v = 1; v < BLOCKS_M.length; v += 1) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + length * 8 <= dataCapacity(v) * 8) return v;
  }
  throw new Error('QR payload too long');
}

function encodeData(bytes, version) {
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCapacity(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8)
    codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  for (let pad = 0; codewords.length < capacity / 8; pad += 1)
    codewords.push(pad % 2 ? 0x11 : 0xec);

  const [ecLength, ...groups] = BLOCKS_M[version];
  const blocks = [];
  let at = 0;
  for (const [count, size] of groups)
    for (let i = 0; i < count; i += 1) {
      const data = codewords.slice(at, at + size);
      at += size;
      blocks.push({ data, ec: ecCodewords(data, ecLength) });
    }
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i += 1)
    for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecLength; i += 1) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ---------- matrix ----------
function bch(value, poly, length) {
  let rest = value << (length - 1);
  const top = Math.floor(Math.log2(poly));
  while (rest > 0 && Math.floor(Math.log2(rest)) >= top)
    rest ^= poly << (Math.floor(Math.log2(rest)) - top);
  return rest;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function baseMatrix(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, dark) => {
    modules[r][c] = dark;
    reserved[r][c] = true;
  };
  const finder = (row, col) => {
    for (let r = -1; r <= 7; r += 1)
      for (let c = -1; c <= 7; c += 1) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        set(rr, cc, ring !== 2 && ring !== 4);
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const centres = ALIGNMENT[version];
  for (const r of centres)
    for (const c of centres) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6))
        continue;
      for (let dr = -2; dr <= 2; dr += 1)
        for (let dc = -2; dc <= 2; dc += 1)
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  set(size - 8, 8, true); // dark module
  // Format areas (filled later).
  for (let i = 0; i < 9; i += 1) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  if (version >= 7) {
    const info = (version << 12) | bch(version, 0x1f25, 13);
    for (let i = 0; i < 18; i += 1) {
      const dark = ((info >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  return { size, modules, reserved };
}

function placeData(matrix, codewords) {
  const { size, modules, reserved } = matrix;
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i -= 1) bits.push((cw >>> i) & 1);
  let index = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc += 1) {
        const col = right - dc;
        if (reserved[row][col]) continue;
        modules[row][col] = index < bits.length ? bits[index] === 1 : false;
        index += 1;
      }
    }
    upward = !upward;
  }
}

function applyFormat(modules, size, mask) {
  // Level M = 00.
  const data = (0b00 << 3) | mask;
  const info = ((data << 10) | bch(data, 0x537, 11)) ^ 0x5412;
  const bit = (i) => ((info >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i += 1) modules[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = bit(i);
  modules[size - 8][8] = true;
}

function penalty(modules) {
  const size = modules.length;
  let score = 0;
  const runs = (get) => {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      for (let b = 1; b < size; b += 1) {
        if (get(a, b) === get(a, b - 1)) run += 1;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  };
  runs((a, b) => modules[a][b]);
  runs((a, b) => modules[b][a]);
  for (let r = 0; r < size - 1; r += 1)
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1])
        score += 3;
    }
  const pattern = [true, false, true, true, true, false, true];
  const finderLike = (get) => {
    for (let a = 0; a < size; a += 1)
      for (let b = 0; b + 7 <= size; b += 1) {
        if (!pattern.every((p, i) => get(a, b + i) === p)) continue;
        const before = [1, 2, 3, 4].every((i) => b - i < 0 || !get(a, b - i));
        const after = [1, 2, 3, 4].every((i) => b + 6 + i >= size || !get(a, b + 6 + i));
        if (before || after) score += 40;
      }
  };
  finderLike((a, b) => modules[a][b]);
  finderLike((a, b) => modules[b][a]);
  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark += 1;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

/** Encodes text (UTF-8) as a QR code; returns a square array of rows of booleans (true = dark). */
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  const version = chooseVersion(bytes.length);
  const codewords = encodeData(bytes, version);
  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = baseMatrix(version);
    placeData(matrix, codewords);
    const fn = MASKS[mask];
    for (let r = 0; r < matrix.size; r += 1)
      for (let c = 0; c < matrix.size; c += 1)
        if (!matrix.reserved[r][c] && fn(r, c)) matrix.modules[r][c] = !matrix.modules[r][c];
    applyFormat(matrix.modules, matrix.size, mask);
    const score = penalty(matrix.modules);
    if (!best || score < best.score) best = { score, modules: matrix.modules };
  }
  return best.modules;
}

/**
 * The EPC QR payload (version 002, UTF-8, SEPA credit transfer). Returns null when the payment
 * cannot be expressed (no valid IBAN, name or amount out of range).
 */
export function epcPayload({ name, iban, bic, cents, text }) {
  const cleanIban = String(iban ?? '')
    .replace(/\s/g, '')
    .toUpperCase();
  const cleanName = String(name ?? '')
    .trim()
    .slice(0, 70);
  if (!cleanIban || !cleanName || !(cents >= 1) || cents > 99999999999) return null;
  const amount = `EUR${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  return [
    'BCD',
    '002',
    '1',
    'SCT',
    String(bic ?? '')
      .replace(/\s/g, '')
      .toUpperCase(),
    cleanName,
    cleanIban,
    amount,
    '',
    '',
    String(text ?? '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 140),
  ].join('\n');
}
