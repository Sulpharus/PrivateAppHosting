// Surface materials of solids for the realistic view: how rough and how metallic a surface is,
// its own colour, and a procedural texture (layer lines of a 3D print, brushed or milled metal,
// wood grain). Colours here are model data (what the part looks like), not interface colours.

export const MATERIALS = {
  pla: { metal: 0, rough: 0.55, tex: 'layers', colour: '#cfc9bc' },
  plaMatte: { metal: 0, rough: 0.85, tex: 'grain', colour: '#3b4048' },
  petg: { metal: 0, rough: 0.22, tex: 'layers', colour: '#2f6db5' },
  abs: { metal: 0, rough: 0.5, tex: 'layers', colour: '#c8352d' },
  tpu: { metal: 0, rough: 0.95, tex: 'grain', colour: '#2a2a2a' },
  resin: { metal: 0, rough: 0.12, tex: 'none', colour: '#9aa3ad' },
  aluminium: { metal: 1, rough: 0.32, tex: 'milled', colour: '#c9ccd0' },
  anodised: { metal: 1, rough: 0.38, tex: 'grain', colour: '#2b2f36' },
  steel: { metal: 1, rough: 0.28, tex: 'brushed', colour: '#9ea3a8' },
  stainless: { metal: 1, rough: 0.14, tex: 'brushed', colour: '#c4c8cc' },
  brass: { metal: 1, rough: 0.2, tex: 'brushed', colour: '#d6b25e' },
  copper: { metal: 1, rough: 0.24, tex: 'brushed', colour: '#d08a5b' },
  wood: { metal: 0, rough: 0.7, tex: 'wood', colour: '#b07a46' },
  acrylic: { metal: 0, rough: 0.04, tex: 'none', colour: '#e9eef2' },
};

export const MATERIAL_IDS = Object.keys(MATERIALS);
const HEX = /^#[0-9a-f]{6}$/i;

/** The default for new solids: printed plastic for 3D printing, aluminium for CNC. */
export const defaultMaterial = (purpose) => (purpose === 'cnc' ? 'aluminium' : 'pla');

/** The effective material of a solid: { id, metal, rough, tex, colour, layer }. */
export function materialOf(solid, purpose) {
  const id = Object.hasOwn(MATERIALS, solid?.material?.id)
    ? solid.material.id
    : defaultMaterial(purpose);
  const m = MATERIALS[id];
  const colour = HEX.test(solid?.material?.colour ?? '') ? solid.material.colour : m.colour;
  const layer = Number.isFinite(solid?.material?.layer) ? solid.material.layer : 0.2;
  return { id, ...m, colour, layer };
}

/** Checks a material object from the editor, a backup or the assistant. */
export function cleanMaterial(m) {
  if (!m || typeof m !== 'object' || !Object.hasOwn(MATERIALS, m.id)) return undefined;
  const out = { id: m.id };
  if (HEX.test(m.colour ?? '')) out.colour = m.colour.toLowerCase();
  if (Number.isFinite(m.layer) && m.layer >= 0.04 && m.layer <= 1) out.layer = m.layer;
  return out;
}

/** '#rrggbb' → linear RGB 0..1 (for lighting in linear space). */
export function linearRgb(hex) {
  return [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}
