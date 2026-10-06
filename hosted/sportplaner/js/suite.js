// Planned sessions as shared suite records (ADR 0002), so they show in the Kalender. Loaded in
// order by index.html; all files share one global scope. Each planned session in the next weeks
// is one `activity` record with source key `<activity id>#<date>`; sessions that are no longer
// planned are removed, past ones stay as history. Without the admin's approval of `suite.uses`
// the database refuses, and the Sportplaner simply goes on without it.

const SUITE_DAYS_BACK = 7;
const SUITE_DAYS_AHEAD = 90;
let suiteTimer = null;
let suiteOff = false;

/** Local "YYYY-MM-DD" + "HH:MM" as an ISO instant. */
function suiteInstant(ds, time) {
  const [y, m, d] = ds.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).toISOString();
}

/* A tiny picture (about 64 px) of the first photo travels inside the record, so the Kalender can
   show it in its list, day and map without access to this app's files. One per photo and visit. */
const suiteImages = new Map(); // photo ref → data URL or null
const SUITE_IMAGE_MAX = 15000;
async function suiteTiny(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const data = scaleTo(img, 64, 0.5, false);
    return data.length <= SUITE_IMAGE_MAX ? data : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function suiteImageOf(a) {
  const ref = a.photos && a.photos[0];
  if (!ref) return null;
  const src = (a.thumbs && a.thumbs[ref]) || ref;
  if (suiteImages.has(src)) return suiteImages.get(src);
  let out = null;
  try {
    out = await suiteTiny(
      src.startsWith('data:') ? await (await fetch(src)).blob() : await fetchBlob(src),
    );
  } catch {
    out = null; // the session goes to the Kalender without a picture
  }
  suiteImages.set(src, out);
  return out;
}
/** Activity id → tiny picture, for the activities that have a photo (4 fetches at a time). */
async function suiteImagesFor() {
  const queue = S.acts.filter((a) => a.photos && a.photos[0]);
  const out = new Map();
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      const image = await suiteImageOf(a);
      if (image) out.set(a.id, image);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

/** The records the planned sessions should be: source key → fields. */
function suiteWanted(images = new Map()) {
  const out = new Map();
  const base = parse(todayStr());
  for (let i = -SUITE_DAYS_BACK; i <= SUITE_DAYS_AHEAD; i++) {
    const ds = ymd(addDays(base, i));
    for (const { a, s } of plannedOn(ds)) {
      const slot = s[0];
      const timed = Boolean(slot?.start);
      const starts = timed ? suiteInstant(ds, slot.start) : suiteInstant(ds);
      const ends = timed
        ? slot.end
          ? suiteInstant(ds, slot.end)
          : new Date(new Date(starts).getTime() + 3600_000).toISOString()
        : suiteInstant(ymd(addDays(parse(ds), 1)));
      out.set(`${a.id}#${ds}`, {
        title: a.name || 'Sport',
        starts_at: starts,
        ends_at: ends,
        place_name: (a.location || a.address || '').slice(0, 300) || null,
        lat: a.geo ? a.geo.lat : null,
        lon: a.geo ? a.geo.lon : null,
        data: {
          all_day: timed ? null : true,
          sport: (a.category || '').slice(0, 100) || null,
          provider: (a.provider || '').slice(0, 200) || null,
          image: images.get(a.id) || null,
          plan_status: isCancelled(a, ds)
            ? 'cancelled'
            : (a.done || []).includes(ds)
              ? 'done'
              : 'planned',
        },
      });
    }
  }
  return out;
}

const same = (a, b) => (a ?? null) === (b ?? null);
const sameTime = (a, b) => (a && b ? new Date(a).getTime() === new Date(b).getTime() : same(a, b));
/** Whether a stored record already has these fields (nothing to write). */
function suiteUnchanged(rec, f) {
  const d = rec.data || {};
  return (
    same(rec.title, f.title) &&
    sameTime(rec.starts_at, f.starts_at) &&
    sameTime(rec.ends_at, f.ends_at) &&
    same(rec.place_name, f.place_name) &&
    same(rec.lat, f.lat) &&
    same(rec.lon, f.lon) &&
    Object.entries(f.data).every(([k, v]) => same(d[k], v))
  );
}

/** Writes one session; if the database refuses the picture (not known to it yet), without it. */
async function upsertSession(act, fields, key) {
  try {
    return await act.upsert(fields, { sourceKey: key });
  } catch (err) {
    if (!err || err.code !== '22023' || !fields.data.image) throw err;
    const { image, ...data } = fields.data;
    return act.upsert({ ...fields, data }, { sourceKey: key });
  }
}

async function suiteSync() {
  if (suiteOff) return;
  const mn = await ready;
  const act = mn.suite.type('activity');
  try {
    const mine = (await act.list({ limit: 5000 })).filter((r) => r.source_app === 'sportplaner');
    const wanted = suiteWanted(await suiteImagesFor());
    const byKey = new Map(mine.map((r) => [r.source_key, r]));
    const from = ymd(addDays(parse(todayStr()), -SUITE_DAYS_BACK));
    const jobs = [];
    for (const [key, fields] of wanted) {
      const rec = byKey.get(key);
      if (!rec || !suiteUnchanged(rec, fields)) jobs.push(() => upsertSession(act, fields, key));
    }
    // no longer planned: gone from the Kalender (earlier sessions stay as history)
    for (const r of mine)
      if (!wanted.has(r.source_key) && (r.source_key || '').split('#')[1] >= from)
        jobs.push(() => act.delete(r.id));
    const queue = [...jobs];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await job();
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  } catch (err) {
    // not approved (yet) or offline: try again with the next change or start
    if (err && err.code === '42501') suiteOff = true;
  }
}

/** Called after every data change; changes in a row sync once. */
function suiteSoon(delay = 3000) {
  clearTimeout(suiteTimer);
  suiteTimer = setTimeout(() => {
    suiteSync();
  }, delay);
}
