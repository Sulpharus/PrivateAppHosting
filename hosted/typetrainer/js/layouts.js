// Keyboard layouts as data. To add a layout, add one entry to LAYOUTS: the characters on each
// physical key (layer 1, Shift, and the third layer: AltGr or Mod3), which keys select the third
// layer, and a name. Everything else (the on-screen keyboard, the fingers, the lessons of the
// learning path) is derived from it.
//
// Keys use the xkb names of an ISO keyboard: TLDE and AE01–AE12 (number row), AD01–AD12 (top),
// AC01–AC12 (home, AC12 is the key left of Enter), LSGT (left of Y/Z) and AB01–AB10 (bottom).
// Typing is checked by character, so the layout on the computer decides what reaches the app; the
// app only shows where a character sits and which finger types it.

export const ROWS = [
  [
    'TLDE',
    'AE01',
    'AE02',
    'AE03',
    'AE04',
    'AE05',
    'AE06',
    'AE07',
    'AE08',
    'AE09',
    'AE10',
    'AE11',
    'AE12',
  ],
  ['AD01', 'AD02', 'AD03', 'AD04', 'AD05', 'AD06', 'AD07', 'AD08', 'AD09', 'AD10', 'AD11', 'AD12'],
  ['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09', 'AC10', 'AC11', 'AC12'],
  ['LSGT', 'AB01', 'AB02', 'AB03', 'AB04', 'AB05', 'AB06', 'AB07', 'AB08', 'AB09', 'AB10'],
];

/** Fingers: l/r hand, 1 = index … 4 = pinky. Thumbs type the space bar. */
const FINGER_COLUMNS = [
  ['l4', 'l4', 'l3', 'l2', 'l1', 'l1', 'r1', 'r1', 'r2', 'r3', 'r4', 'r4', 'r4'],
  ['l4', 'l3', 'l2', 'l1', 'l1', 'r1', 'r1', 'r2', 'r3', 'r4', 'r4', 'r4'],
  ['l4', 'l3', 'l2', 'l1', 'l1', 'r1', 'r1', 'r2', 'r3', 'r4', 'r4', 'r4'],
  ['l4', 'l4', 'l3', 'l2', 'l1', 'l1', 'r1', 'r1', 'r2', 'r3', 'r4'],
];
export const FINGERS = Object.fromEntries(
  ROWS.flatMap((row, r) => row.map((key, c) => [key, FINGER_COLUMNS[r][c]])),
);

/**
 * One row of a layout from three strings of the same length as the row: layer 1, Shift, layer 3.
 * A space means "nothing on this layer".
 */
function row(keys, l1, l2, l3 = '') {
  const a = [...l1];
  const b = [...l2];
  const c = [...l3];
  const out = {};
  keys.forEach((key, i) => {
    const layers = [a[i], b[i], c[i]].map((ch) => (ch && ch !== ' ' ? ch : null));
    if (layers.some(Boolean)) out[key] = layers;
  });
  return out;
}

function layout(def) {
  const keys = {};
  def.rows.forEach((r, i) => {
    Object.assign(keys, row(ROWS[i], ...r));
  });
  return { ...def, keys };
}

const NEO_NUMBERS = [' 1234567890- ', ' °§ℓ»«$€„“”— ', ' ¹²³›‹¢¥‚‘’  '];

export const LAYOUTS = [
  layout({
    id: 'qwertz',
    name: 'QWERTZ',
    family: 'classic',
    third: { label: 'AltGr', keys: ['RALT'] },
    // Dead keys need a second press (e.g. ^ then Space); the app checks the character that results.
    dead: '^´`',
    rows: [
      ['^1234567890ß´', '°!"§$%&/()=?`', '  ²³   {[]}\\ '],
      ['qwertzuiopü+', 'QWERTZUIOPÜ*', '@ €        ~'],
      ['asdfghjklöä#', "ASDFGHJKLÖÄ'"],
      ['<yxcvbnm,.-', '>YXCVBNM;:_', '|      µ   '],
    ],
  }),
  layout({
    id: 'qwerty',
    name: 'QWERTY',
    family: 'classic',
    third: null,
    dead: '',
    rows: [
      ['`1234567890-=', '~!@#$%^&*()_+'],
      ['qwertyuiop[]', 'QWERTYUIOP{}'],
      ["asdfghjkl;'\\", 'ASDFGHJKL:"|'],
      [' zxcvbnm,./', ' ZXCVBNM<>?'],
    ],
  }),
  layout({
    id: 'neo',
    name: 'Neo 2',
    family: 'neo',
    third: { label: 'M3', keys: ['CAPS', 'AC12'] },
    dead: '',
    rows: [
      NEO_NUMBERS,
      ['xvlcwkhgfqß ', 'XVLCWKHGFQẞ ', '…_[]^!<>=&  '],
      ['uiaeosnrtdy ', 'UIAEOSNRTDY ', '\\/{}*?()-:@ '],
      [' üöäpzbm,.j', ' ÜÖÄPZBM–•J', ' #$|~`+%"\';'],
    ],
  }),
  layout({
    id: 'bone',
    name: 'Bone',
    family: 'neo',
    third: { label: 'M3', keys: ['CAPS', 'AC12'] },
    dead: '',
    rows: [
      NEO_NUMBERS,
      ['jduaxphlmwß ', 'JDUAXPHLMWẞ ', '…_[]^!<>=&  '],
      ['ctieobnrsgq ', 'CTIEOBNRSGQ ', '\\/{}*?()-:@ '],
      [' fvüäöyz,.k', ' FVÜÄÖYZ–•K', ' #$|~`+%"\';'],
    ],
  }),
  layout({
    id: 'noted',
    name: 'Noted',
    family: 'neo',
    // Noted moves Mod3 from the key left of Enter to the key right of H (QWERTZ Ä).
    third: { label: 'M3', keys: ['CAPS', 'AC11'] },
    dead: '',
    rows: [
      NEO_NUMBERS,
      ['zyuaqpbmlfjß', 'ZYUAQPBMLFJẞ', '…_[]^!<>=&@ '],
      ['csieodtnrh  ', 'CSIEODTNRH  ', '\\/{}*?()-:  '],
      [' vxüäöwg,.k', ' VXÜÄÖWG–•K', ' #$|~`+%"\';'],
    ],
  }),
];

export function getLayout(id) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** Where a character sits: { key, layer } (layer 0, 1 = Shift, 2 = third layer), or null. */
export function locate(layout, ch) {
  if (ch === ' ') return { key: 'SPCE', layer: 0 };
  if (ch === '\n') return { key: 'RTRN', layer: 0 };
  let best = null;
  for (const [key, layers] of Object.entries(layout.keys)) {
    const layer = layers.indexOf(ch);
    if (layer < 0) continue;
    // Prefer a key that types the character directly over a dead key on a lower layer.
    const dead = layout.dead.includes(ch) && layer === 0;
    const rank = layer + (dead ? 10 : 0);
    if (!best || rank < best.rank) best = { key, layer, rank };
  }
  return best && { key: best.key, layer: best.layer };
}

/** The modifier to hold for a character: the Shift or third-layer key on the other hand. */
export function modifierFor(layout, place) {
  if (!place || place.layer === 0) return null;
  const hand = FINGERS[place.key]?.[0] ?? 'l';
  if (place.layer === 1) return hand === 'l' ? 'RSHIFT' : 'LSHIFT';
  const third = layout.third?.keys ?? [];
  if (third.length < 2) return third[0] ?? null;
  // Neo family: CapsLock is left, the other Mod3 key right.
  return hand === 'l' ? third[1] : third[0];
}

/** The order in which the learning path brings in keys: home row first, finger by finger. */
const STAGES = [
  ['AC04', 'AC07'],
  ['AC03', 'AC08'],
  ['AC02', 'AC09'],
  ['AC01', 'AC10'],
  ['AC05', 'AC06'],
  ['AD03', 'AD08'],
  ['AD04', 'AD07'],
  ['AD02', 'AD09'],
  ['AD05', 'AD06'],
  ['AD01', 'AD10'],
  ['AB04', 'AB07'],
  ['AB03', 'AB08'],
  ['AB02', 'AB09'],
  ['AB05', 'AB06'],
  ['AB01', 'AB10'],
  ['AC11', 'AD11', 'AD12', 'AC12', 'LSGT'],
];

const isLetter = (ch) => /^\p{L}$/u.test(ch);

/**
 * The letter stages of a layout: each a list of new lower-case characters (letters, plus comma and
 * full stop where they sit on those keys). Stages without anything new are dropped, and a stage
 * with a single new key is merged into the next one.
 */
export function letterStages(layout) {
  const stages = [];
  let carry = [];
  for (const keys of STAGES) {
    const chars = keys
      .map((key) => layout.keys[key]?.[0])
      .filter((ch) => ch && (isLetter(ch) || ch === ',' || ch === '.'));
    const all = [...carry, ...chars];
    if (all.length === 0) continue;
    if (all.filter(isLetter).length < 2 && keys !== STAGES[STAGES.length - 1]) {
      carry = all;
      continue;
    }
    stages.push(all);
    carry = [];
  }
  if (carry.length) stages.push(carry);
  return stages;
}

/** The characters a layout types without a dead key: for checking generated texts. */
export function typeable(layout) {
  const set = new Set([' ', '\n']);
  for (const layers of Object.values(layout.keys)) for (const ch of layers) if (ch) set.add(ch);
  return set;
}
