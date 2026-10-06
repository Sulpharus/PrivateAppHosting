// Storage in the app's own tables (activities, plans; ADR 0022). Loaded after backup.js, whose
// sanitize functions turn every row into the objects the rest of the app works with.
/* ---------- rows <-> objects ---------- */
// The columns refuse what the app's sanitizers let through (very long texts, huge numbers): cut and
// clamp on the way in, so one odd old entry can never make a save or the copy fail.
const LIMITS = {
  name: 500,
  category: 500,
  provider: 500,
  description: 20000,
  location: 500,
  address: 500,
  signupUrl: 2000,
  signupNotes: 5000,
  cost: 500,
  level: 200,
  contact: 500,
  website: 2000,
  notes: 20000,
};
const clip = (v, max) => String(v ?? '').slice(0, max);
const clamp = (v, max) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0);
const money = (v) => Math.round(clamp(Number(v), 99999999) * 100) / 100;
const ACT_KEYS = new Set([
  ...TEXT,
  'id',
  'signup',
  'visitPrice',
  'access',
  'equipment',
  'done',
  'cancelled',
  'geo',
  'course',
  'slots',
  'season',
  'planned',
  'photos',
  'thumbs',
  'updatedAt',
]);
const COLUMN_OF = {
  signupUrl: 'signup_url',
  signupNotes: 'signup_notes',
};
const colOf = (key) => COLUMN_OF[key] || key;

function actRow(a) {
  const row = { id: a.id };
  for (const key of TEXT) row[colOf(key)] = clip(a[key], LIMITS[key]);
  const geo = a.geo;
  const course = a.course;
  Object.assign(row, {
    signup: a.signup,
    visit_price: money(a.visitPrice),
    access_guest: !!a.access?.guest,
    access_students: !!a.access?.students,
    access_membership: !!a.access?.membership,
    equipment: a.equipment ?? [],
    done: a.done ?? [],
    cancelled: a.cancelled ?? [],
    geo_lat: geo ? geo.lat : null,
    geo_lon: geo ? geo.lon : null,
    geo_label: geo ? geo.label : null,
    geo_q: geo ? geo.q : null,
    course_from: course ? course.from : null,
    course_until: course ? course.until : null,
    course_price: money(course?.price) > 0 ? money(course.price) : null,
    course_price_type: money(course?.price) > 0 ? (course.priceType ?? 'total') : null,
    slots: a.slots ?? [],
    season: a.season ?? { type: 'all' },
    planned: a.planned ?? { mode: 'none' },
    photos: a.photos ?? [],
    thumbs: a.thumbs ?? {},
    details: Object.fromEntries(Object.entries(a).filter(([key]) => !ACT_KEYS.has(key))),
    edited_ms: Math.round(clamp(a.updatedAt, 1e15)),
  });
  return row;
}

function rowAct(r) {
  const raw = { ...(r.details || {}), id: r.id };
  for (const key of TEXT) raw[key] = r[colOf(key)];
  Object.assign(raw, {
    signup: r.signup,
    visitPrice: Number(r.visit_price) || 0,
    access: {
      guest: r.access_guest,
      students: r.access_students,
      membership: r.access_membership,
    },
    equipment: r.equipment,
    done: r.done,
    cancelled: r.cancelled,
    geo:
      r.geo_lat === null || r.geo_lat === undefined
        ? undefined
        : { lat: r.geo_lat, lon: r.geo_lon, label: r.geo_label ?? '', q: r.geo_q ?? '' },
    course: r.course_from
      ? {
          from: r.course_from,
          until: r.course_until,
          ...(r.course_price
            ? { price: Number(r.course_price), priceType: r.course_price_type }
            : {}),
        }
      : undefined,
    slots: r.slots,
    season: r.season,
    planned: r.planned,
    photos: r.photos,
    thumbs: r.thumbs,
    updatedAt: r.edited_ms,
  });
  return sanitizeAct(raw, true);
}

function planRow(p) {
  return {
    id: p.id,
    name: clip(p.name, 500),
    provider: clip(p.provider, 500),
    category: clip(p.category, 500),
    notes: clip(p.notes, 20000),
    type: p.type,
    unit: p.unit,
    every: p.every,
    visits: Math.min(p.visits, 1e9),
    amount: money(p.amount),
    start_on: p.start || null,
    end_on: p.end || null,
    activities: p.activities ?? [],
    quota: p.quota ?? null,
    links: p.links ?? null,
    edited_ms: Math.round(clamp(p.updatedAt, 1e15)),
  };
}

function rowPlan(r) {
  return sanitizePlan({
    id: r.id,
    name: r.name,
    provider: r.provider,
    category: r.category,
    notes: r.notes,
    type: r.type,
    unit: r.unit,
    every: r.every,
    visits: r.visits,
    amount: Number(r.amount),
    start: r.start_on || '',
    end: r.end_on || '',
    activities: r.activities,
    quota: r.quota || undefined,
    links: r.links || undefined,
    updatedAt: r.edited_ms,
  });
}

/* ---------- the tables ---------- */
const KEY = { conflict: 'owner_id,id' };
const actTable = (mn) => mn.table('activities', KEY);
const planTable = (mn) => mn.table('plans', KEY);
const MIGRATED = 'meta:tablesFrom'; // kv flag: the entries of the old kv storage were copied

/**
 * Copies the activities and tariffs that older versions kept as kv entries into the tables, once.
 * Rows that exist already are never overwritten (another device may have copied or edited them);
 * the kv entries stay as a backup. A failure leaves the flag unset, so the next start tries again.
 */
// kv-collection-ok: reads the old kv entries once to copy them into the tables
async function copyFromKv(mn) {
  if ((await mn.kv.get(MIGRATED)) || !mn.offline.online()) return; // offline: the next start copies
  const [oldActs, oldPlans, haveActs, havePlans] = await Promise.all([
    mn.kv.list(ACT),
    mn.kv.list(PLAN),
    actTable(mn).list(),
    planTable(mn).list(),
  ]);
  const hasAct = new Set(haveActs.map((r) => r.id));
  const hasPlan = new Set(havePlans.map((r) => r.id));
  const valid = (x) => x.value && typeof x.value === 'object';
  // An id with "/" or beyond the column's length cannot be a row; one refused entry must not stop
  // the others. What failed is counted: the flag is only set when everything was copied.
  let failed = 0;
  const copy = async (job) => {
    try {
      await job();
    } catch {
      failed++;
    }
  };
  for (const x of oldActs.filter(valid)) {
    const id = x.key.slice(ACT.length);
    if (!hasAct.has(id))
      await copy(() => actTable(mn).upsert(actRow(sanitizeAct({ ...x.value, id }, true))));
  }
  for (const x of oldPlans.filter(valid)) {
    const id = x.key.slice(PLAN.length);
    if (!hasPlan.has(id))
      await copy(() => planTable(mn).upsert(planRow(sanitizePlan({ ...x.value, id }))));
  }
  if (failed) return;
  await mn.kv.set(MIGRATED, Date.now());
}

async function readAll(mn) {
  await copyFromKv(mn);
  const [acts, plans] = await Promise.all([actTable(mn).list(), planTable(mn).list()]);
  return { acts: acts.map(rowAct), plans: plans.map(rowPlan) };
}
