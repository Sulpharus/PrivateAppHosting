// Export and import, and sanitising stored or imported data. Loaded in order by index.html; all files share one global scope.
/* ---------- backup: export / import ---------- */
const BK = { busy: false, msg: '' };
function updBackup() {
  const el = $('#backup');
  if (!el) return;
  const last = S.lastBackup;
  const age = last ? Math.floor((Date.now() - +last) / 864e5) : null;
  const lastTxt = !last
    ? 'Du hast noch nicht exportiert.'
    : age === 0
      ? 'Zuletzt heute exportiert.'
      : `Zuletzt exportiert am ${fmt(new Date(+last), { day: 'numeric', month: 'short', year: 'numeric' })}.`;
  const off = BK.busy || (!S.acts.length && !S.plans.length);
  setHTML(
    el,
    `<h3>Datensicherung</h3><p>${lastTxt} Beim Export werden alle Aktivitäten, Besuche, Tarife und Fotos in einer Datei gespeichert. Beim Import wird der Inhalt der Datei hinzugefügt und bereits Vorhandenes aktualisiert.</p>
    <div class="two"><button class="btn" data-action="export"${off ? ' disabled' : ''}>Exportieren</button><label class="btn filebtn${BK.busy ? ' off' : ''}">Importieren<input type="file" accept=".json,application/json" id="importfile"></label></div>
    <p class="status" role="status">${esc(BK.msg)}</p>`,
  );
}
function bkStatus(msg, busy) {
  BK.msg = msg;
  if (busy !== undefined) BK.busy = busy;
  updBackup();
}
const blobToDataURL = (b) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(b);
  });
function dataURLToBlob(du) {
  const [head, b64] = du.split(',');
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' });
}
/* store one image: full size and a thumbnail in mn.files; both are cached locally as blob: URLs */
async function storeImage(blob) {
  const img = await decode(blob);
  try {
    const mn = await ready,
      id = newId(),
      ref = `photos/${id}.jpg`,
      thumb = `photos/${id}-klein.jpg`;
    const [full, small] = [
      await scaleTo(img, 1600, 0.84, true),
      await scaleTo(img, 640, 0.8, true),
    ];
    await Promise.all([
      mn.files.upload(ref, full, { contentType: 'image/jpeg' }),
      mn.files.upload(thumb, small, { contentType: 'image/jpeg' }),
    ]);
    media.set(ref, URL.createObjectURL(full));
    media.set(thumb, URL.createObjectURL(small));
    return { ref, thumb };
  } finally {
    if (img.close) img.close();
  }
}
async function exportData() {
  if (BK.busy) return;
  bkStatus('Export wird vorbereitet …', true);
  try {
    const refs = [
      ...new Set(S.acts.flatMap((a) => (a.photos || []).filter((r) => !r.startsWith('data:')))),
    ];
    const photos = {};
    let missing = 0;
    for (let i = 0; i < refs.length; i++) {
      bkStatus(`Foto ${i + 1} von ${refs.length} wird verpackt …`);
      try {
        photos[refs[i]] = await blobToDataURL(await fetchBlob(refs[i]));
      } catch {
        missing++;
      }
    }
    const activities = S.acts.map(({ thumbs, ...rest }) => rest);
    const blob = new Blob(
      [
        JSON.stringify({
          app: 'sport-planner',
          version: 2,
          exportedAt: new Date().toISOString(),
          activities,
          plans: S.plans,
          photos,
        }),
      ],
      { type: 'application/json' },
    );
    const filename = `sportplaner-sicherung-${todayStr()}.json`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    S.lastBackup = Date.now();
    ready.then((mn) => mn.kv.set(LAST_BACKUP, S.lastBackup)).catch(() => {});
    bkStatus(
      missing
        ? `${activities.length} ${activities.length === 1 ? 'Aktivität' : 'Aktivitäten'} exportiert. ${missing} ${missing > 1 ? 'Fotos konnten' : 'Foto konnte'} nicht aufgenommen werden.`
        : `${activities.length} ${activities.length === 1 ? 'Aktivität' : 'Aktivitäten'} mit ${refs.length} ${refs.length === 1 ? 'Foto' : 'Fotos'} exportiert.`,
      false,
    );
  } catch (e) {
    bkStatus(
      e && e.code === 'declined'
        ? 'Export abgebrochen.'
        : e && e.code === 'rate_limited'
          ? 'Ein Speicherdialog ist bereits geöffnet.'
          : 'Die Sicherungsdatei konnte nicht erstellt werden. Bitte erneut versuchen.',
      false,
    );
  }
}
/* backups come from other devices or the original artifact: keep only well-formed dates, so a bad
   file can neither break the calendar nor inject markup */
const TEXT = [
  'name',
  'category',
  'provider',
  'description',
  'location',
  'address',
  'signupUrl',
  'signupNotes',
  'cost',
  'level',
  'contact',
  'website',
  'notes',
];
const text = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const weekdays = (v) =>
  arr(v)
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
/* Stored or imported data is untrusted: coerce every field the UI relies on to its type, so one
   bad record can neither crash rendering nor inject markup. keepMedia keeps photo refs (kv data);
   imports store their photos again. */
const legacyRange = (o) =>
  isDay(o.from) || isDay(o.until)
    ? { type: 'range', from: isDay(o.from) ? o.from : '', until: isDay(o.until) ? o.until : '' }
    : { type: 'all' };
function sanitizeAct(raw, keepMedia = false) {
  const period = (p) =>
    p && typeof p === 'object' && (p.type === 'yearly' || p.type === 'range')
      ? {
          type: p.type,
          from: String(p.from || ''),
          until: String(p.until || ''),
          label: String(p.label || ''),
        }
      : undefined;
  const pl = raw.planned && typeof raw.planned === 'object' ? raw.planned : { mode: 'none' };
  const slots = arr(raw.slots)
    .filter((s) => s && (s.kind === 'date' ? isDay(s.date) : Array.isArray(s.days)))
    .map((s) => {
      const o =
        s.kind === 'date'
          ? { kind: 'date', date: s.date }
          : { kind: 'weekly', days: weekdays(s.days) };
      o.start = String(s.start || '');
      o.end = String(s.end || '');
      const per = s.kind === 'date' ? undefined : period(s.period);
      if (per) o.period = per;
      return o;
    });
  const texts = Object.fromEntries(TEXT.map((k) => [k, text(raw[k])]));
  const photos = keepMedia ? arr(raw.photos).filter((r) => typeof r === 'string') : [];
  const thumbs = {};
  if (keepMedia && raw.thumbs && typeof raw.thumbs === 'object')
    for (const r of photos) if (typeof raw.thumbs[r] === 'string') thumbs[r] = raw.thumbs[r];
  const acc = raw.access && typeof raw.access === 'object' ? raw.access : {};
  return {
    ...raw,
    ...texts,
    id: text(raw.id),
    signup: raw.signup in SIGNUP ? raw.signup : 'none',
    visitPrice: Number.isFinite(raw.visitPrice) && raw.visitPrice > 0 ? raw.visitPrice : 0,
    access: {
      guest: acc.guest === true,
      students: acc.students === true,
      membership: acc.membership === true,
    },
    slots,
    equipment: arr(raw.equipment).map(text),
    done: arr(raw.done).filter(isDay),
    cancelled: arr(raw.cancelled).filter(isDay),
    geo:
      raw.geo &&
      typeof raw.geo.q === 'string' &&
      [raw.geo.lat, raw.geo.lon].every(
        (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''),
      ) &&
      validGeo({ lat: +raw.geo.lat, lon: +raw.geo.lon })
        ? {
            lat: +raw.geo.lat,
            lon: +raw.geo.lon,
            label: text(raw.geo.label).slice(0, 200),
            q: raw.geo.q.slice(0, 300),
          }
        : undefined,
    course:
      raw.course &&
      isDay(raw.course.from) &&
      isDay(raw.course.until) &&
      raw.course.from <= raw.course.until
        ? {
            from: raw.course.from,
            until: raw.course.until,
            ...(Number.isFinite(+raw.course.price) &&
            +raw.course.price > 0 &&
            +raw.course.price <= 100000
              ? {
                  price: Math.round(+raw.course.price * 100) / 100,
                  priceType: raw.course.priceType === 'month' ? 'month' : 'total',
                }
              : {}),
          }
        : undefined,
    photos,
    thumbs,
    // Older records keep the offer period in from/until instead of season.
    season: period(raw.season) || legacyRange(raw),
    planned: {
      mode: ['none', 'weekly', 'dates', 'both'].includes(pl.mode) ? pl.mode : 'none',
      every: [1, 2, 3, 4].includes(pl.every) ? pl.every : 1,
      anchor: isDay(pl.anchor) ? pl.anchor : '',
      days: weekdays(pl.days),
      dates: arr(pl.dates).filter(isDay),
      skip: arr(pl.skip).filter(isDay),
      season: period(pl.season) || legacyRange(pl),
    },
  };
}
function sanitizePlan(raw) {
  const amount = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount);
  return {
    id: text(raw.id),
    name: text(raw.name),
    provider: text(raw.provider),
    category: text(raw.category),
    notes: text(raw.notes),
    type: raw.type in PTYPES ? raw.type : 'recurring',
    unit: raw.unit in UNITS ? raw.unit : 'month',
    every: Number.isInteger(raw.every) && raw.every >= 1 && raw.every <= 100 ? raw.every : 1,
    visits: Number.isInteger(raw.visits) && raw.visits >= 1 ? raw.visits : 10,
    amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    start: isDay(raw.start) ? raw.start : '',
    end: isDay(raw.end) ? raw.end : '',
    activities: arr(raw.activities).filter((x) => typeof x === 'string'),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}
async function importData(file) {
  if (BK.busy) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return bkStatus('Diese Datei ist keine Sportplaner-Sicherung.');
  }
  if (!data || data.app !== 'sport-planner' || !Array.isArray(data.activities))
    return bkStatus('Diese Datei ist keine Sportplaner-Sicherung.');
  bkStatus('Import läuft …', true);
  const photos = data.photos || {};
  const known = new Map(); // photo ids still stored in this artifact
  for (const a of S.acts) for (const r of a.photos || []) known.set(r, (a.thumbs || {})[r]);
  let count = 0,
    lost = 0,
    failed = 0;
  const list = data.activities.filter((a) => a && typeof a.id === 'string' && a.name);
  for (const raw of list) {
    bkStatus(`Import ${count + failed + 1} von ${list.length} …`);
    const a = sanitizeAct(raw);
    for (const r of raw.photos || []) {
      try {
        if (typeof r !== 'string') continue;
        if (known.has(r)) {
          a.photos.push(r);
          if (known.get(r)) a.thumbs[r] = known.get(r);
          continue;
        }
        const du = r.startsWith('data:') ? r : photos[r];
        if (!du) {
          lost++;
          continue;
        }
        const st = await storeImage(dataURLToBlob(du));
        a.photos.push(st.ref);
        if (st.thumb) a.thumbs[st.ref] = st.thumb;
      } catch {
        lost++;
      }
    }
    try {
      await persist(a);
      count++;
    } catch {
      failed++;
    }
  }
  let pcount = 0;
  for (const p of Array.isArray(data.plans) ? data.plans : []) {
    if (!p || typeof p.id !== 'string' || !p.name) continue;
    try {
      await persistPlan(sanitizePlan(p));
      pcount++;
    } catch {
      failed++;
    }
  }
  bkStatus(
    `${count} ${count === 1 ? 'Aktivität' : 'Aktivitäten'}${pcount ? ` und ${pcount} ${pcount === 1 ? 'Tarif' : 'Tarife'}` : ''} importiert.` +
      (lost
        ? ` ${lost} ${lost > 1 ? 'Fotos konnten' : 'Foto konnte'} nicht wiederhergestellt werden.`
        : '') +
      (failed ? ` ${failed} konnten nicht gespeichert werden.` : ''),
    false,
  );
}
H.export = () => exportData();
document.addEventListener('change', (e) => {
  if (e.target.id === 'importfile' && e.target.files[0]) {
    const f = e.target.files[0];
    e.target.value = '';
    importData(f);
  }
});
