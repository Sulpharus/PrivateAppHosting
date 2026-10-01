// Tariffs, costs and the Statistik view, plus the tariff editor. Loaded in order by index.html; all files share one global scope.
/* ---------- tariffs, costs and statistics ---------- */
S.plans = [];
S.year = new Date().getFullYear();
S.costBy = 'provider';
function plansChanged() {
  scheduleRender();
}
const eurF = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur = (n) => eurF.format(n || 0);
const numF = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoney = (v) => {
  const s = String(v ?? '').replace(/[\s€]/g, '');
  if (!s) return NaN;
  return parseFloat(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};
const UNITS = {
  day: ['Tag', 'Tage'],
  week: ['Woche', 'Wochen'],
  month: ['Monat', 'Monate'],
  year: ['Jahr', 'Jahre'],
};
const EVERY1 = { day: 'täglich', week: 'wöchentlich', month: 'monatlich', year: 'jährlich' };
const PTYPES = {
  recurring: 'Wiederkehrend (Abo, Mitgliedschaft)',
  once: 'Einmalig',
  visit: 'Pro Besuch',
  card: 'Mehrfachkarte (z. B. 10er-Karte)',
};
const PLAN_AMOUNT_LABEL = {
  recurring: 'Betrag pro Zahlung in €',
  once: 'Betrag in €',
  visit: 'Preis pro Besuch in €',
  card: 'Kartenpreis in €',
};

function addInterval(d, n, unit) {
  const x = new Date(d);
  if (unit === 'day') x.setDate(x.getDate() + n);
  else if (unit === 'week') x.setDate(x.getDate() + 7 * n);
  else {
    const day = x.getDate();
    x.setDate(1);
    x.setMonth(x.getMonth() + (unit === 'year' ? 12 * n : n));
    x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  }
  return x;
}
function paymentsCount(p, from, to) {
  if (!p.start) return 0;
  const end = p.end && p.end < to ? p.end : to,
    st = parse(p.start),
    n = Math.max(1, +p.every || 1);
  let c = 0;
  for (let k = 0; k < 6000; k++) {
    // k-th payment from the anchor date: no month-end drift
    const ds = ymd(addInterval(st, k * n, p.unit || 'month'));
    if (ds > end) break;
    if (ds >= from) c++;
  }
  return c;
}
function planSummary(p) {
  const a = eur(p.amount);
  if (p.type === 'once')
    return `${a} einmalig${p.start ? ' am ' + fmt(parse(p.start), { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`;
  if (p.type === 'visit') return `${a} pro Besuch`;
  if (p.type === 'card') return `${p.visits || 10}er-Karte für ${a}`;
  const n = +p.every || 1,
    u = p.unit || 'month';
  return `${a} ${n === 1 ? EVERY1[u] : `alle ${n} ${UNITS[u][1]}`}${p.end ? ', gekündigt zum ' + fmt(parse(p.end), { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`;
}
const visitsIn = (a, from, to) =>
  (a.done || []).reduce((c, d) => c + (d >= from && d <= to ? 1 : 0), 0);

function computeStats(Y) {
  const from = `${Y}-01-01`,
    yEnd = `${Y}-12-31`,
    td = todayStr(),
    to = yEnd < td ? yEnd : td;
  const actMap = new Map(S.acts.map((a) => [a.id, a]));
  const vis = new Map(S.acts.map((a) => [a.id, visitsIn(a, from, yEnd)]));
  const byDay = new Map();
  for (const a of S.acts)
    for (const d of a.done || []) if (d >= from && d <= yEnd) byDay.set(d, (byDay.get(d) || 0) + 1);
  const entries = [],
    planStats = [],
    covered = new Set();
  const push = (amount, a, p, label) => {
    if (amount > 0)
      entries.push({
        amount,
        act: a ? a.id : null,
        provider: (p && p.provider) || (a && a.provider) || 'Ohne Anbieter',
        category: (p && p.category) || (a && a.category) || 'Ohne Sportart',
        tarif: label,
      });
  };
  let forecast = 0;
  for (const p of S.plans) {
    const linked = (p.activities || []).map((id) => actMap.get(id)).filter(Boolean);
    const lv = linked.reduce((s, a) => s + vis.get(a.id), 0),
      amt = +p.amount || 0;
    let total = 0,
      fc = 0;
    if (p.type === 'visit' || p.type === 'card') {
      const unit = p.type === 'visit' ? amt : amt / Math.max(1, +p.visits || 1);
      linked.forEach((a) => {
        covered.add(a.id);
        push(unit * vis.get(a.id), a, p, p.name);
      });
      total = fc = unit * lv;
    } else {
      if (p.type === 'once') {
        total = p.start >= from && p.start <= to ? amt : 0;
        fc = p.start >= from && p.start <= yEnd ? amt : 0;
      } else {
        total = amt * paymentsCount(p, from, to);
        fc = amt * paymentsCount(p, from, yEnd);
      }
      if (total) {
        const w = linked.map((a) => vis.get(a.id)),
          sw = w.reduce((s, x) => s + x, 0);
        if (!linked.length) push(total, null, p, p.name);
        else
          linked.forEach((a, i) => {
            push(total * (sw ? w[i] / sw : 1 / linked.length), a, p, p.name); // split by use
          });
      }
    }
    forecast += fc;
    planStats.push({ p, total, visits: lv, perVisit: lv && total ? total / lv : null });
  }
  // Course prices: each session that takes place carries its share, booked on its date.
  for (const a of S.acts) {
    const cp = coursePrices(a);
    if (!cp) continue;
    covered.add(a.id);
    let spent = 0,
      planned = 0;
    for (const [d, share] of cp.per) {
      if (d < from || d > yEnd) continue;
      planned += share;
      if (d <= to) spent += share;
    }
    push(spent, a, null, 'Kurse');
    forecast += planned;
  }
  for (const a of S.acts) {
    const pr = +a.visitPrice || 0;
    if (pr > 0 && !covered.has(a.id)) {
      const c = pr * vis.get(a.id);
      push(c, a, null, 'Einzelpreise');
      forecast += c;
    }
  }
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const group = (k) => {
    const m = new Map();
    for (const e of entries) m.set(e[k], (m.get(e[k]) || 0) + e.amount);
    return [...m].sort((x, y) => y[1] - x[1]);
  };
  const actCost = new Map();
  entries.forEach((e) => {
    if (e.act) actCost.set(e.act, (actCost.get(e.act) || 0) + e.amount);
  });
  const usage = S.acts
    .map((a) => ({ a, n: vis.get(a.id), cost: actCost.get(a.id) || 0 }))
    .filter((x) => x.n || x.cost)
    .sort((x, y) => y.n - x.n || y.cost - x.cost);
  // Attendance: planned sessions up to today, without the ones that did not take place.
  let plannedN = 0,
    attended = 0;
  for (const a of S.acts) {
    if (!hasPlan(a)) continue;
    const done = new Set(a.done || []);
    for (let d = parse(from); ymd(d) <= to; d = addDays(d, 1)) {
      const ds = ymd(d);
      if (!isPlanned(a, ds) || isCancelled(a, ds)) continue;
      plannedN++;
      if (done.has(ds)) attended++;
    }
  }
  return {
    byDay,
    plannedN,
    attended,
    total,
    forecast,
    usage,
    planStats,
    groups: { provider: group('provider'), category: group('category'), tarif: group('tarif') },
    sessions: [...byDay.values()].reduce((s, x) => s + x, 0),
    activeDays: byDay.size,
    isCurrent: from <= td && yEnd >= td,
  };
}

SKELETON.stats = `<div id="st-sum"></div><div class="card heat-card" id="st-heat"></div><div class="stat-cols"><div id="st-usage"></div><div id="st-cost"></div></div><div id="st-plans"></div>`;

function updStats() {
  const Y = S.year,
    st = computeStats(Y),
    td = todayStr();
  setHeader(
    'Statistik',
    st.isCurrent
      ? 'Stand heute'
      : Y < new Date().getFullYear()
        ? 'Abgeschlossenes Jahr'
        : 'Kommendes Jahr',
  );
  setHTML(
    $('#tools'),
    `<div class="stepper" role="group" aria-label="Jahr"><button class="arrow" data-action="year" data-dir="-1" aria-label="Vorheriges Jahr">${ICON.left}</button><b>${Y}</b><button class="arrow" data-action="year" data-dir="1" aria-label="Nächstes Jahr">${ICON.right}</button></div>`,
  );
  setHTML(
    $('#st-sum'),
    `<div class="kpis"><div><b>${st.sessions}</b><span>Einheiten</span></div><div><b>${st.activeDays}</b><span>Aktive Tage</span></div><div><b>${st.plannedN ? `${Math.round((st.attended / st.plannedN) * 100)} %` : '–'}</b><span>${st.plannedN ? `Teilnahme: ${st.attended} von ${st.plannedN} geplanten Terminen` : 'Teilnahme an geplanten Terminen'}</span></div><div><b>${eur(st.total)}</b><span>${st.isCurrent ? 'Kosten bisher' : 'Kosten'}</span></div></div>${st.plannedN ? '<p class="note kpi-note">Ausgefallene Termine zählen weder als Teilnahme noch als verpasst.</p>' : ''}`,
  );

  const months = [...Array(12)]
    .map((_, m) => {
      const first = new Date(Y, m, 1),
        days = new Date(Y, m + 1, 0).getDate(),
        mn = fmt(first, { month: 'long' });
      let cells = '<i class="hm-pad"></i>'.repeat(wIdx(first));
      for (let d = 1; d <= days; d++) {
        const ds = `${Y}-${pad(m + 1)}-${pad(d)}`,
          c = st.byDay.get(ds) || 0;
        cells += `<button class="hm l${Math.min(c, 3)}${ds === td ? ' now' : ''}" data-action="heatday" data-date="${ds}" aria-label="${d}. ${mn}: ${c} ${c === 1 ? 'Einheit' : 'Einheiten'}"></button>`;
      }
      return `<div class="hm-month"><span>${fmt(first, { month: 'short' }).replace('.', '')}</span><div class="hm-grid">${cells}</div></div>`;
    })
    .join('');
  setHTML(
    $('#st-heat'),
    `<div class="heat">${months}</div><div class="hm-legend">Weniger<i class="hm"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i>Mehr</div>`,
  );

  const maxN = Math.max(1, ...st.usage.map((u) => u.n));
  setHTML(
    $('#st-usage'),
    `<div class="sect"><h3>Nutzung</h3></div>` +
      (st.usage.length
        ? `<div class="card pad">${st.usage.map((u) => `<button class="ubar" data-action="open" data-id="${esc(u.a.id)}"><span class="u-top"><b>${esc(u.a.name)}</b><span>${u.n}×${u.cost ? ', ' + eur(u.cost) + (u.n ? ` (${eur(u.cost / u.n)} pro Besuch)` : '') : ''}</span></span><span class="meter"><i style="width:${Math.max(2, (u.n / maxN) * 100)}%"></i></span></button>`).join('')}</div>`
        : `<p class="note">Noch keine Besuche in ${Y}. Markiere Aktivitäten als erledigt oder trage Besuche in der Detailansicht nach.</p>`),
  );

  const g = st.groups[S.costBy],
    maxC = Math.max(0.01, ...g.map((x) => x[1]));
  const seg = `<div class="seg" role="group" aria-label="Kosten gruppieren nach">${[
    ['provider', 'Anbieter'],
    ['category', 'Sportart'],
    ['tarif', 'Tarif'],
  ]
    .map(
      ([k, l]) =>
        `<button type="button" class="${S.costBy === k ? 'on' : ''}" data-action="costby" data-by="${k}" aria-pressed="${S.costBy === k}">${l}</button>`,
    )
    .join('')}</div>`;
  const fc =
    st.isCurrent && st.forecast > st.total + 0.005
      ? `Voraussichtlich ${eur(st.forecast)} im ganzen Jahr`
      : st.isCurrent
        ? 'Bis heute'
        : `Gesamt ${Y}`;
  setHTML(
    $('#st-cost'),
    `<div class="sect"><h3>Kosten</h3></div>` +
      (st.total || st.forecast
        ? `<div class="card pad"><div class="costhead"><b>${eur(st.total)}</b><span>${fc}</span></div>${seg}${g.map(([k, v]) => `<div class="ubar"><span class="u-top"><b>${esc(k)}</b><span>${eur(v)}, ${Math.round((v / (st.total || 1)) * 100)} %</span></span><span class="meter"><i style="width:${Math.max(2, (v / maxC) * 100)}%"></i></span></div>`).join('')}</div>`
        : `<p class="note">Noch keine Kosten für ${Y}. Lege unten einen Tarif an oder trage bei einer Aktivität einen Preis pro Besuch ein.</p>`),
  );

  const actName = (id) => (S.acts.find((a) => a.id === id) || {}).name;
  setHTML(
    $('#st-plans'),
    `<div class="sect"><h3>Tarife und Mitgliedschaften</h3>${S.plans.length ? '<button class="link" data-action="new-plan">Hinzufügen</button>' : ''}</div>` +
      (S.plans.length
        ? `<div class="list-card">${[...st.planStats]
            .sort((x, y) => x.p.name.localeCompare(y.p.name, 'de'))
            .map(({ p, total, visits, perVisit }) => {
              const links = (p.activities || []).map(actName).filter(Boolean);
              return `<button class="row prow" data-action="edit-plan" data-id="${esc(p.id)}"><span class="min"><h4>${esc(p.name)}</h4><p>${esc([planSummary(p), p.provider].filter(Boolean).join(', '))}</p>${links.length ? `<p>${esc(links.join(', '))}</p>` : ''}</span><span class="next"><b>${eur(total)}</b>${visits ? `${visits} ${visits === 1 ? 'Besuch' : 'Besuche'}` : ''}${perVisit ? `<br>${eur(perVisit)} pro Besuch` : ''}</span></button>`;
            })
            .join('')}</div>`
        : emptyHTML(
            'stats',
            'Noch keine Tarife',
            'Trage Mitgliedschaften, Abos und Mehrfachkarten ein, z. B. Urban Sports Club oder dein Gym.',
            '<button class="btn primary" data-action="new-plan">Tarif hinzufügen</button>',
          )),
  );
}
UPD.stats = updStats;

/* ---------- tariff editor ---------- */
let pdraft = null,
  planDelArmed = false;
function openPlanEditor(p) {
  pdraft = p
    ? JSON.parse(JSON.stringify(p))
    : {
        id: newId(),
        name: '',
        provider: '',
        category: '',
        type: 'recurring',
        amount: '',
        every: 1,
        unit: 'month',
        visits: 10,
        start: todayStr(),
        end: '',
        activities: [],
        notes: '',
      };
  S.sheet = { type: 'plan', isNew: !p };
  planDelArmed = false;
  const uniq = (key) =>
    [
      ...new Set([...S.acts.map((x) => x[key]), ...S.plans.map((x) => x[key])].filter(Boolean)),
    ].sort((x, y) => x.localeCompare(y, 'de'));
  const v = (k) => esc(pdraft[k] ?? '');
  const opt = (val, label, cur) =>
    `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const acts = [...S.acts].sort((x, y) => x.name.localeCompare(y.name, 'de'));
  openSheet(
    `<div class="bar"><button class="btn ghost" data-action="close">Abbrechen</button><h2 id="sheet-title">${p ? 'Tarif bearbeiten' : 'Neuer Tarif'}</h2><span></span></div>
  <form class="form" id="planform" data-type="${esc(pdraft.type)}" novalidate>
    <fieldset><legend>Tarif</legend>
      <label class="f">Name<input name="name" value="${v('name')}" placeholder="z. B. Urban Sports Club M" autocomplete="off"></label>
      <div class="two"><label class="f">Anbieter<input name="provider" value="${v('provider')}" list="pprovs" autocomplete="off"></label><label class="f">Sportart<input name="category" value="${v('category')}" list="pcats" placeholder="optional" autocomplete="off"></label></div>
      <datalist id="pprovs">${uniq('provider')
        .map((c) => `<option value="${esc(c)}">`)
        .join('')}</datalist><datalist id="pcats">${uniq('category')
        .map((c) => `<option value="${esc(c)}">`)
        .join('')}</datalist>
      <p class="hint">Ohne Anbieter oder Sportart werden die Kosten nach deinen Besuchen auf die zugeordneten Aktivitäten verteilt.</p>
    </fieldset>
    <fieldset><legend>Zahlung</legend>
      <label class="f">Zahlungsart<select name="type" id="ptype">${Object.entries(PTYPES)
        .map(([k, l]) => opt(k, l, pdraft.type))
        .join('')}</select></label>
      <div class="two"><label class="f"><span id="amountlbl">${PLAN_AMOUNT_LABEL[pdraft.type]}</span><input name="amount" inputmode="decimal" value="${pdraft.amount === '' ? '' : esc(numF.format(pdraft.amount))}" placeholder="0,00" autocomplete="off"></label>
        <label class="f only-card">Anzahl Besuche<input name="visits" type="number" inputmode="numeric" min="1" value="${v('visits')}"></label>
        <label class="f only-recurring">Alle<input name="every" type="number" inputmode="numeric" min="1" value="${v('every')}"></label></div>
      <label class="f only-recurring">Intervall<select name="unit">${Object.entries(UNITS)
        .map(([k, l]) => opt(k, l[1], pdraft.unit))
        .join('')}</select></label>
      <div class="two only-dated"><label class="f"><span class="only-recurring">Erste Zahlung</span><span class="only-once">Zahlungsdatum</span><input type="date" name="start" value="${v('start')}"></label><label class="f only-recurring">Gekündigt zum<input type="date" name="end" value="${v('end')}"></label></div>
      <p class="hint only-recurring">„Gekündigt zum“ leer lassen, solange der Tarif läuft.</p>
      <p class="hint only-card">Jeder Besuch wird anteilig verbucht: Kartenpreis geteilt durch die Anzahl Besuche.</p>
    </fieldset>
    <fieldset><legend>Gilt für</legend>
      ${acts.length ? `<div class="checks">${acts.map((a) => `<label><input type="checkbox" name="acts" value="${esc(a.id)}"${(pdraft.activities || []).includes(a.id) ? ' checked' : ''}><span>${esc(a.name)}${a.provider ? `<small>${esc(a.provider)}</small>` : ''}</span></label>`).join('')}</div>` : '<p class="hint">Lege zuerst Aktivitäten an, um sie diesem Tarif zuzuordnen.</p>'}
      <p class="hint">Besuche dieser Aktivitäten werden dem Tarif zugerechnet, daraus ergeben sich die Kosten pro Besuch.</p>
    </fieldset>
    <fieldset><legend>Notizen</legend><label class="f">Notizen<textarea name="notes" rows="3">${v('notes')}</textarea></label></fieldset>
    <p class="err" id="perr" role="alert" hidden></p>
  </form>
  <div class="sheet-foot">${p ? '<button type="button" class="btn danger" data-action="del-plan">Tarif löschen</button>' : ''}<span class="grow"></span><button type="button" class="btn primary" data-action="save-plan">${p ? 'Speichern' : 'Tarif anlegen'}</button></div>`,
    true,
  );
}
async function savePlan() {
  const fd = new FormData($('#planform')),
    err = $('#perr');
  const fail = (m) => {
    err.textContent = m;
    err.hidden = false;
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const p = { ...pdraft };
  for (const k of ['name', 'provider', 'category', 'type', 'unit', 'start', 'end', 'notes'])
    p[k] = String(fd.get(k) || '').trim();
  p.amount = parseMoney(fd.get('amount'));
  p.every = Math.max(1, parseInt(fd.get('every'), 10) || 1);
  p.visits = Math.max(1, parseInt(fd.get('visits'), 10) || 1);
  p.activities = fd.getAll('acts');
  if (!p.name) return fail('Gib dem Tarif einen Namen.');
  if (!(p.amount >= 0)) return fail('Gib einen gültigen Betrag ein, z. B. 29,90.');
  if ((p.type === 'recurring' || p.type === 'once') && !p.start)
    return fail(
      p.type === 'once' ? 'Gib das Zahlungsdatum an.' : 'Gib das Datum der ersten Zahlung an.',
    );
  if (p.type === 'recurring' && p.end && p.end < p.start)
    return fail('Das Kündigungsdatum liegt vor der ersten Zahlung.');
  if (p.type !== 'recurring') p.end = '';
  p.updatedAt = Date.now();
  const isNew = S.sheet.isNew;
  try {
    await persistPlan(p);
    closeSheet();
    toast(isNew ? 'Tarif hinzugefügt' : 'Tarif gespeichert');
  } catch {
    fail('Speichern fehlgeschlagen. Prüfe deine Verbindung und versuche es erneut.');
  }
}
async function persistPlan(p) {
  writes++;
  const mn = await ready;
  await mn.kv.set(PLAN + p.id, p);
  S.plans = [...S.plans.filter((x) => x.id !== p.id), p];
  plansChanged();
}
async function removePlan(p) {
  writes++;
  const mn = await ready;
  await mn.kv.delete(PLAN + p.id);
  S.plans = S.plans.filter((x) => x.id !== p.id);
  plansChanged();
}

Object.assign(H, {
  year: (t) => {
    S.year += +t.dataset.dir;
    render();
  },
  heatday: (t) => {
    S.date = t.dataset.date;
    S.view = 'day';
    render();
    window.scrollTo(0, 0);
  },
  costby: (t) => {
    S.costBy = t.dataset.by;
    render();
  },
  'new-plan': () => openPlanEditor(null),
  'edit-plan': (t) => {
    const p = S.plans.find((x) => x.id === t.dataset.id);
    if (p) openPlanEditor(p);
  },
  'save-plan': () => savePlan(),
  'del-plan': async (t) => {
    if (!planDelArmed) {
      planDelArmed = true;
      t.textContent = 'Zum Löschen erneut tippen';
      setTimeout(() => {
        planDelArmed = false;
        if (t.isConnected) t.textContent = 'Tarif löschen';
      }, 3000);
      return;
    }
    const p = pdraft;
    closeSheet();
    try {
      await removePlan(p);
      toast('Tarif gelöscht');
    } catch {
      toast('Löschen fehlgeschlagen. Bitte erneut versuchen.');
    }
  },
  'add-visit': async () => {
    const a = S.acts.find((x) => x.id === S.sheet.id),
      d = $('#visitdate') && $('#visitdate').value;
    if (!a || !d) return;
    if (d > todayStr()) return toast('Besuche können nur bis heute eingetragen werden.');
    if ((a.done || []).includes(d))
      return toast('Für diesen Tag ist bereits ein Besuch eingetragen.');
    try {
      await persist({
        ...a,
        done: [...(a.done || []), d].sort(),
        cancelled: (a.cancelled || []).filter((x) => x !== d),
      });
      toast('Besuch eingetragen');
    } catch {
      toast('Eintragen fehlgeschlagen. Bitte erneut versuchen.');
    }
  },
  'del-visit': async (t) => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (!a) return;
    try {
      await persist({ ...a, done: (a.done || []).filter((x) => x !== t.dataset.d) });
      toast('Besuch entfernt');
    } catch {
      toast('Entfernen fehlgeschlagen. Bitte erneut versuchen.');
    }
  },
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'ptype') {
    $('#planform').dataset.type = e.target.value;
    setText($('#amountlbl'), PLAN_AMOUNT_LABEL[e.target.value]);
  }
});
