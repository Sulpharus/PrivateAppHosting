// The CAD assistant: the person asks in their own words, the model answers with a short reply and
// a list of exact operations (model.js). The app validates and previews them; nothing changes
// until the person presses "Übernehmen". Runs only on a button press, through mn.ai.

import { MATERIAL_IDS } from './materials.js';
import { describe, OPS } from './model.js';

const NUM = { type: 'number' };

/** JSON schema of the answer (kept to the subset every provider accepts). */
export const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Short answer for the person, in their language.' },
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: OPS },
          target: { type: 'string', description: 'id of an existing entity (e…) or solid (s…)' },
          x: NUM,
          y: NUM,
          z: NUM,
          x1: NUM,
          y1: NUM,
          x2: NUM,
          y2: NUM,
          cx: NUM,
          cy: NUM,
          r: NUM,
          r2: NUM,
          w: NUM,
          d: NUM,
          h: NUM,
          dx: NUM,
          dy: NUM,
          dz: NUM,
          rx: NUM,
          ry: NUM,
          rz: NUM,
          start: NUM,
          end: NUM,
          angle: NUM,
          offset: NUM,
          size: NUM,
          text: { type: 'string' },
          name: { type: 'string' },
          title: { type: 'string' },
          sheetMaterial: { type: 'string', description: 'material text in the title block' },
          scale: { type: 'string' },
          paper: { type: 'string', enum: ['A4', 'A3', 'A2'] },
          orientation: { type: 'string', enum: ['landscape', 'portrait'] },
          style: { type: 'string', enum: ['solid', 'center', 'hidden', 'construction'] },
          mode: { type: 'string', enum: ['add', 'subtract'] },
          kind: { type: 'string', enum: ['aligned', 'h', 'v'] },
          axis: { type: 'string', enum: ['x', 'y'] },
          method: { type: 'string', enum: ['first', 'third'] },
          closed: { type: 'boolean' },
          hidden: { type: 'boolean' },
          targets: { type: 'array', items: { type: 'string' } },
          pitch: NUM,
          clearance: NUM,
          left: { type: 'boolean' },
          material: {
            type: 'object',
            properties: {
              id: { type: 'string', enum: MATERIAL_IDS },
              colour: { type: 'string', description: '#rrggbb' },
              layer: NUM,
            },
            required: ['id'],
          },
          views: {
            type: 'array',
            items: { type: 'string', enum: ['front', 'top', 'left', 'right', 'iso'] },
          },
          points: {
            type: 'array',
            items: { type: 'object', properties: { x: NUM, y: NUM }, required: ['x', 'y'] },
          },
        },
        required: ['op'],
      },
    },
  },
  required: ['reply', 'operations'],
};

const SYSTEM = `You are the assistant inside a CAD app for 3D printing and CNC machining. You work on the person's project together with them and change it only through operations the app validates and the person confirms.

Coordinates and units: millimetres. The 2D drawing ("sketch") has X to the right and Y up. The 3D model has Z up; the build plate is z = 0. Angles are degrees, counter-clockwise.
Sketch operations: add_line(x1,y1,x2,y2), add_rect(x,y = lower-left corner, w,h), add_circle(cx,cy,r), add_arc(cx,cy,r,start,end; counter-clockwise from start to end), add_polyline(points[{x,y}], closed), add_dimension(x1,y1,x2,y2, kind h|v|aligned, offset = distance of the dimension line), add_text(x,y,text,size). Optional style: solid, center (centre lines), hidden, construction (helper lines, not exported).
Solids: add_box(x,y,z = minimum corner, w along X, d along Y, h along Z), add_cylinder(x,y,z = centre of the bottom face, r, h; axis Z), add_cone(x,y,z, r bottom, r2 top, h), add_sphere(x,y,z = centre, r). Optional rx,ry,rz rotate about the solid's own origin, name, and mode: "add" for material or "subtract" for holes, pockets and cut-outs (subtracted from every added solid). A through hole must be longer than the part: start it 1 mm below and end it 1 mm above.
add_thread(x,y,z = centre of the bottom end, d = nominal diameter, pitch (omit for ISO coarse: M3 0.5, M4 0.7, M5 0.8, M6 1, M8 1.25, M10 1.5, M12 1.75), h = length, mode add = bolt or subtract = threaded hole, clearance mm for printed fits (0.1–0.2 for FDM, 0 for machining), left) makes a true ISO metric helical thread along Z. For a screw, put a head (cylinder or box) on top; for a nut or threaded hole, subtract the thread from the part.
Materials: any solid can take material {id: pla|plaMatte|petg|abs|tpu|resin|aluminium|anodised|steel|stainless|brass|copper|wood|acrylic, colour '#rrggbb', layer (print layer height mm)} in add_* or set; it changes only how the part looks.
extrude(target = id of a closed sketch shape: rect, circle or closed polyline, h, z) makes a prism from it.
Edit: set(target, any field above: exact new values), move(target, dx,dy[,dz]), mirror(target, axis x|y, cx, cy: mirror line through that point; axis y = vertical line), rotate(target, angle[, cx, cy] for sketch shapes; solids turn about Z), duplicate(target, dx,dy,dz), delete(target).
Assemblies: solids can belong to a part (id g<n>, listed in project.parts; a solid's part is its "part" field). A part's holes cut only that part, so a bolt can sit in a hole of another part. make_group(targets = solid ids, name) makes a part; move_group(target = part id, dx,dy,dz) and rotate_group(target, angle[, cx, cy]) move a whole part; set_group(target, name, material, hidden); ungroup(target); delete_group(target). To make parts fit, leave clearance (0.2–0.4 mm for FDM prints, a fit tolerance for machining).
Drawing sheet: generate_views(views: front, top, left, right, iso; method first|third; optional x,y = lower-left corner of the front view, otherwise right of the existing drawing) replaces earlier generated views with orthographic views of the solids, hidden edges and overall dimensions. set_sheet(title, sheetMaterial = material text of the title block, scale like "1:2", paper A4|A3|A2, orientation).

Rules:
- Compute every number exactly and double-check sums, centres and offsets before answering. Use the ids in the project; never invent ids. New items get ids e<n>/s<n> after the operations run, so refer only to existing ids.
- Do only what was asked. If the request is unclear or impossible, ask one short question and return no operations.
- For 3D printing keep walls at least 1.2 mm and mention overhangs over 45°; for CNC mention inside corners that need the tool radius.
- The reply is plain text, at most four sentences, no Markdown. It says what the operations do.`;

/** Asks the model; returns { reply, operations }. Throws AiError from the SDK. */
export async function ask(
  mn,
  { model, project, selection, history, request, lang, signal, settings },
) {
  const context = {
    project: describe(project),
    selection,
    printer: settings.printer,
    cam: settings.cam,
  };
  const turns = history
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'Person' : 'Assistant'}: ${h.text}`)
    .join('\n');
  const prompt = [
    `Project (JSON): ${JSON.stringify(context)}`,
    turns ? `Conversation so far:\n${turns}` : '',
    `Request: ${request}`,
    lang === 'en' ? 'Answer in English.' : 'Antworte auf Deutsch (informell, du).',
  ]
    .filter(Boolean)
    .join('\n\n');
  const answer = await mn.ai.json(prompt, SCHEMA, {
    model,
    system: SYSTEM,
    signal,
    maxOutputTokens: 4000,
    temperature: 0,
  });
  return validateAnswer(answer);
}

/** Keeps only well-formed parts of an answer. */
export function validateAnswer(answer) {
  const reply = typeof answer?.reply === 'string' ? answer.reply.slice(0, 2000) : '';
  const ops = Array.isArray(answer?.operations)
    ? answer.operations
        .filter((o) => o && typeof o === 'object' && OPS.includes(o.op))
        .slice(0, 200)
    : [];
  return { reply, operations: ops };
}

/** The message for an AI error code. */
export function aiErrorKey(err) {
  const code = err?.code ?? '';
  if (code === 'budget_exceeded') return 'ai.error.budget';
  if (code === 'model_not_allowed') return 'ai.error.model';
  if (code === 'rate_limited') return 'ai.error.rate';
  if (code === 'preview_only') return 'ai.error.preview';
  if (code === 'invalid_json') return 'ai.error.invalid';
  if (code === 'provider_error') return 'ai.error.provider';
  if (code === 'ai_disabled') return 'ai.error.disabled';
  if (err?.name === 'AbortError') return 'ai.error.cancelled';
  return 'ai.error.network';
}
