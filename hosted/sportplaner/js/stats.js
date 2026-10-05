// Tariffs, costs and the Statistik view, plus the tariff editor. Loaded in order by index.html; all files share one global scope.
/* ---------- tariffs, costs and statistics ---------- */
S.plans = [];
S.year = new Date().getFullYear();
S.costBy = 'provider';
function plansChanged() {
  scheduleRender();
}
const numFormats = new Map();
const numFormat = (kind) => {
  const k = loc() + kind;
  if (!numFormats.has(k))
    numFormats.set(
      k,
      new Intl.NumberFormat(
        loc(),
        kind === 'eur'
          ? { style: 'currency', currency: 'EUR' }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      ),
    );
  return numFormats.get(k);
};
const eur = (n) => numFormat('eur').format(n || 0);
const numF = { format: (n) => numFormat('dec').format(n) };
const parseMoney = (v) => parseEuro(v);
// Stored values are the keys; the values are language keys.
const UNITS = {
  day: 'unit.day',
  week: 'unit.week',
  month: 'unit.month',
  year: 'unit.year',
};
const PTYPES = {
  recurring: 'plan.type.recurring',
  once: 'plan.type.once',
  visit: 'plan.type.visit',
  card: 'plan.type.card',
};
const PLAN_AMOUNT_LABEL = {
  recurring: 'plan.amount.recurring',
  once: 'plan.amount.once',
  visit: 'plan.amount.visit',
  card: 'plan.amount.card',
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
  const date = (v) => fmt(parse(v), { day: '2-digit', month: 'short', year: 'numeric' });
  if (p.type === 'once')
    return p.start
      ? tr('plan.sumOnceOn', { amount: a, date: date(p.start) })
      : tr('plan.sumOnce', { amount: a });
  if (p.type === 'visit') return tr('plan.sumVisit', { amount: a });
  if (p.type === 'card') return tr('plan.sumCard', { visits: p.visits || 10, amount: a });
  const n = +p.every || 1,
    u = p.unit || 'month';
  const text =
    n === 1
      ? tr('plan.sumEvery', { amount: a, every: tr(`plan.every1.${u}`) })
      : tr('plan.sumEveryN', { amount: a, n, unit: tr(UNITS[u]) });
  return p.end ? tr('plan.cancelledOn', { text, date: date(p.end) }) : text;
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
        provider: (p && p.provider) || (a && a.provider) || tr('stats.noProvider'),
        category: (p && p.category) || (a && a.category) || tr('stats.noSport'),
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
  // Course prices: each session that takes place carries its share, booked on its date. A
  // course linked to a tariff is paid through the tariff and is not counted twice.
  const tariffed = new Set(S.plans.flatMap((p) => p.activities || []));
  for (const a of S.acts) {
    const cp = tariffed.has(a.id) ? null : coursePrices(a);
    if (!cp) continue;
    covered.add(a.id);
    let spent = 0,
      planned = 0;
    for (const [d, share] of cp.per) {
      if (d < from || d > yEnd) continue;
      planned += share;
      if (d <= to) spent += share;
    }
    push(spent, a, null, tr('stats.courses'));
    forecast += planned;
  }
  for (const a of S.acts) {
    const pr = +a.visitPrice || 0;
    if (pr > 0 && !covered.has(a.id)) {
      const c = pr * vis.get(a.id);
      push(c, a, null, tr('stats.singlePrices'));
      forecast += c;
    }
  }
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const group = (k) => {
    const m = new Map();
    for (const e of entries) {
      // An offer with several sports shares its cost between them.
      const keys = k === 'category' ? sportsOf(e.category) : [e[k]];
      for (const key of keys.length ? keys : [e[k]])
        m.set(key, (m.get(key) || 0) + e.amount / (keys.length || 1));
    }
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

SKELETON_EXTRA.push(() => ({
  stats: `<div id="st-sum"></div><div class="card heat-card" id="st-heat"></div><div class="stat-cols"><div id="st-usage"></div><div id="st-cost"></div></div><div id="st-plans"></div>`,
}));

function updStats() {
  const Y = S.year,
    st = computeStats(Y),
    td = todayStr();
  setHeader(
    tr('stats.title'),
    tr(
      st.isCurrent
        ? 'stats.subCurrent'
        : Y < new Date().getFullYear()
          ? 'stats.subPast'
          : 'stats.subFuture',
    ),
  );
  setHTML(
    $('#tools'),
    `<div class="stepper" role="group" aria-label="${esc(tr('stats.year'))}"><button class="arrow" data-action="year" data-dir="-1" aria-label="${esc(tr('stats.prevYear'))}">${ICON.left}</button><b>${Y}</b><button class="arrow" data-action="year" data-dir="1" aria-label="${esc(tr('stats.nextYear'))}">${ICON.right}</button></div>`,
  );
  setHTML(
    $('#st-sum'),
    `<div class="kpis"><div><b>${st.sessions}</b><span>${esc(tr('stats.sessions'))}</span></div><div><b>${st.activeDays}</b><span>${esc(tr('stats.activeDays'))}</span></div><div><b>${st.plannedN ? `${Math.round((st.attended / st.plannedN) * 100)} %` : '–'}</b><span>${esc(st.plannedN ? tr('stats.attendance', { attended: st.attended, planned: st.plannedN }) : tr('stats.attendanceEmpty'))}</span></div><div><b>${eur(st.total)}</b><span>${esc(tr(st.isCurrent ? 'stats.costSoFar' : 'stats.cost'))}</span></div></div>${st.plannedN ? `<p class="note kpi-note">${esc(tr('stats.cancelledNote'))}</p>` : ''}`,
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
        cells += `<button class="hm l${Math.min(c, 3)}${ds === td ? ' now' : ''}" data-action="heatday" data-date="${ds}" aria-label="${esc(tr('stats.heatCell', { day: d, month: mn, n: c }))}"></button>`;
      }
      return `<div class="hm-month"><span>${fmt(first, { month: 'short' }).replace('.', '')}</span><div class="hm-grid">${cells}</div></div>`;
    })
    .join('');
  setHTML(
    $('#st-heat'),
    `<div class="heat">${months}</div><div class="hm-legend">${esc(tr('stats.less'))}<i class="hm"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i>${esc(tr('stats.more'))}</div>`,
  );

  const maxN = Math.max(1, ...st.usage.map((u) => u.n));
  setHTML(
    $('#st-usage'),
    `<div class="sect"><h3>${esc(tr('stats.usage'))}</h3></div>` +
      (st.usage.length
        ? `<div class="card pad">${st.usage.map((u) => `<button class="ubar" data-action="open" data-id="${esc(u.a.id)}"><span class="u-top"><b>${esc(u.a.name)}</b><span>${u.n}×${u.cost ? esc(tr('stats.usageCost', { cost: eur(u.cost) }) + (u.n ? ` ${tr('stats.usagePerVisit', { cost: eur(u.cost / u.n) })}` : '')) : ''}</span></span><span class="meter"><i style="width:${Math.max(2, (u.n / maxN) * 100)}%"></i></span></button>`).join('')}</div>`
        : `<p class="note">${esc(tr('stats.noVisitsYet', { year: Y }))}</p>`),
  );

  const g = st.groups[S.costBy],
    maxC = Math.max(0.01, ...g.map((x) => x[1]));
  const seg = `<div class="seg" role="group" aria-label="${esc(tr('stats.groupBy'))}">${[
    ['provider', tr('stats.byProvider')],
    ['category', tr('stats.bySport')],
    ['tarif', tr('stats.byTariff')],
  ]
    .map(
      ([k, l]) =>
        `<button type="button" class="${S.costBy === k ? 'on' : ''}" data-action="costby" data-by="${k}" aria-pressed="${S.costBy === k}">${esc(l)}</button>`,
    )
    .join('')}</div>`;
  const fc =
    st.isCurrent && st.forecast > st.total + 0.005
      ? tr('stats.forecast', { amount: eur(st.forecast) })
      : st.isCurrent
        ? tr('stats.untilToday')
        : tr('stats.total', { year: Y });
  setHTML(
    $('#st-cost'),
    `<div class="sect"><h3>${esc(tr('stats.cost'))}</h3></div>` +
      (st.total || st.forecast
        ? `<div class="card pad"><div class="costhead"><b>${eur(st.total)}</b><span>${esc(fc)}</span></div>${seg}${g.map(([k, v]) => `<div class="ubar"><span class="u-top"><b>${esc(k)}</b><span>${eur(v)}, ${Math.round((v / (st.total || 1)) * 100)} %</span></span><span class="meter"><i style="width:${Math.max(2, (v / maxC) * 100)}%"></i></span></div>`).join('')}</div>`
        : `<p class="note">${esc(tr('stats.noCostYet', { year: Y }))}</p>`),
  );

  const actName = (id) => (S.acts.find((a) => a.id === id) || {}).name;
  setHTML(
    $('#st-plans'),
    `<div class="sect"><h3>${esc(tr('stats.plansTitle'))}</h3>${S.plans.length ? `<button class="link" data-action="new-plan">${esc(tr('action.add'))}</button>` : ''}</div>` +
      (S.plans.length
        ? `<div class="list-card">${[...st.planStats]
            .sort((x, y) => x.p.name.localeCompare(y.p.name, loc()))
            .map(({ p, total, visits, perVisit }) => {
              const links = (p.activities || []).map(actName).filter(Boolean);
              return `<button class="row prow" data-action="edit-plan" data-id="${esc(p.id)}"><span class="min"><h4>${esc(p.name)}</h4><p>${esc([planSummary(p), p.provider].filter(Boolean).join(', '))}</p>${links.length ? `<p>${esc(links.join(', '))}</p>` : ''}</span><span class="next"><b>${eur(total)}</b>${visits ? esc(tr('stats.visits', { n: visits })) : ''}${perVisit ? `<br>${esc(tr('stats.perVisit', { price: eur(perVisit) }))}` : ''}</span></button>`;
            })
            .join('')}</div>`
        : emptyHTML(
            'stats',
            esc(tr('stats.noPlans')),
            esc(tr('stats.noPlansText')),
            `<button class="btn primary" data-action="new-plan">${esc(tr('stats.addPlan'))}</button>`,
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
    ].sort((x, y) => x.localeCompare(y, loc()));
  const v = (k) => esc(pdraft[k] ?? '');
  const opt = (val, label, cur) =>
    `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const acts = [...S.acts].sort((x, y) => x.name.localeCompare(y.name, loc()));
  openSheet(
    `<div class="bar"><button class="btn ghost" data-action="close">${esc(tr('action.cancel'))}</button><h2 id="sheet-title">${esc(tr(p ? 'plan.edit' : 'plan.new'))}</h2><span></span></div>
  <form class="form" id="planform" data-type="${esc(pdraft.type)}" novalidate>
    <fieldset><legend>${esc(tr('plan.sectionPlan'))}</legend>
      <label class="f">${esc(tr('plan.name'))}<input name="name" value="${v('name')}" placeholder="${esc(tr('plan.namePlaceholder'))}" autocomplete="off"></label>
      <div class="two"><label class="f">${esc(tr('plan.provider'))}<input name="provider" value="${v('provider')}" list="pprovs" autocomplete="off"></label><label class="f">${esc(tr('plan.sport'))}<input name="category" value="${v('category')}" list="pcats" placeholder="${esc(tr('plan.optional'))}" autocomplete="off"></label></div>
      <datalist id="pprovs">${uniq('provider')
        .map((c) => `<option value="${esc(c)}">`)
        .join('')}</datalist><datalist id="pcats">${uniq('category')
        .map((c) => `<option value="${esc(c)}">`)
        .join('')}</datalist>
      <p class="hint">${esc(tr('plan.hintAllocate'))}</p>
    </fieldset>
    <fieldset><legend>${esc(tr('plan.sectionPayment'))}</legend>
      <label class="f">${esc(tr('plan.paymentType'))}<select name="type" id="ptype">${Object.entries(
        PTYPES,
      )
        .map(([k, l]) => opt(k, tr(l), pdraft.type))
        .join('')}</select></label>
      <div class="two"><label class="f"><span id="amountlbl">${esc(tr(PLAN_AMOUNT_LABEL[pdraft.type]))}</span><input name="amount" inputmode="decimal" value="${pdraft.amount === '' ? '' : esc(numF.format(pdraft.amount))}" placeholder="${esc(tr('plan.amountPlaceholder'))}" autocomplete="off"></label>
        <label class="f only-card">${esc(tr('plan.cardVisits'))}<input name="visits" type="number" inputmode="numeric" min="1" value="${v('visits')}"></label>
        <label class="f only-recurring">${esc(tr('plan.every'))}<input name="every" type="number" inputmode="numeric" min="1" value="${v('every')}"></label></div>
      <label class="f only-recurring">${esc(tr('plan.interval'))}<select name="unit">${Object.entries(
        UNITS,
      )
        .map(([k, l]) => opt(k, tr(l), pdraft.unit))
        .join('')}</select></label>
      <div class="two only-dated"><label class="f"><span class="only-recurring">${esc(tr('plan.firstPayment'))}</span><span class="only-once">${esc(tr('plan.paymentDate'))}</span><input type="date" name="start" value="${v('start')}"></label><label class="f only-recurring">${esc(tr('plan.cancelledTo'))}<input type="date" name="end" value="${v('end')}"></label></div>
      <p class="hint only-recurring">${esc(tr('plan.hintCancelled'))}</p>
      <p class="hint only-card">${esc(tr('plan.hintCard'))}</p>
    </fieldset>
    <fieldset><legend>${esc(tr('plan.appliesTo'))}</legend>
      ${acts.length ? `<div class="checks">${acts.map((a) => `<label><input type="checkbox" name="acts" value="${esc(a.id)}"${(pdraft.activities || []).includes(a.id) ? ' checked' : ''}><span>${esc(a.name)}${a.provider ? `<small>${esc(a.provider)}</small>` : ''}</span></label>`).join('')}</div>` : `<p class="hint">${esc(tr('plan.addActivitiesFirst'))}</p>`}
      <p class="hint">${esc(tr('plan.hintVisits'))}</p>
    </fieldset>
    <fieldset><legend>${esc(tr('plan.notes'))}</legend><label class="f">${esc(tr('plan.notes'))}<textarea name="notes" rows="3">${v('notes')}</textarea></label></fieldset>
    <p class="err" id="perr" role="alert" hidden></p>
  </form>
  <div class="sheet-foot">${p ? `<button type="button" class="btn danger" data-action="del-plan">${esc(tr('plan.delete'))}</button>` : ''}<span class="grow"></span><button type="button" class="btn primary" data-action="save-plan">${esc(tr(p ? 'plan.save' : 'plan.create'))}</button></div>`,
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
  if (!p.name) return fail(tr('plan.errName'));
  if (!(p.amount >= 0)) return fail(tr('plan.errAmount'));
  if ((p.type === 'recurring' || p.type === 'once') && !p.start)
    return fail(tr(p.type === 'once' ? 'plan.errDateOnce' : 'plan.errDateFirst'));
  if (p.type === 'recurring' && p.end && p.end < p.start) return fail(tr('plan.errCancelBefore'));
  if (p.type !== 'recurring') p.end = '';
  p.updatedAt = Date.now();
  const isNew = S.sheet.isNew;
  try {
    await persistPlan(p);
    closeSheet();
    toast(tr(isNew ? 'plan.added' : 'plan.saved'));
  } catch {
    fail(tr('plan.saveFailed'));
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
      t.textContent = tr('plan.confirmDelete');
      setTimeout(() => {
        planDelArmed = false;
        if (t.isConnected) t.textContent = tr('plan.delete');
      }, 3000);
      return;
    }
    const p = pdraft;
    closeSheet();
    try {
      await removePlan(p);
      toast(tr('plan.deleted'));
    } catch {
      toast(tr('plan.deleteFailed'));
    }
  },
  'add-visit': async () => {
    const a = S.acts.find((x) => x.id === S.sheet.id),
      d = $('#visitdate') && $('#visitdate').value;
    if (!a || !d) return;
    if (d > todayStr()) return toast(tr('visit.future'));
    if ((a.done || []).includes(d)) return toast(tr('visit.exists'));
    try {
      await persist({
        ...a,
        done: [...(a.done || []), d].sort(),
        cancelled: (a.cancelled || []).filter((x) => x !== d),
      });
      toast(tr('visit.added'));
    } catch {
      toast(tr('visit.addFailed'));
    }
  },
  'del-visit': async (t) => {
    const a = S.acts.find((x) => x.id === S.sheet.id);
    if (!a) return;
    try {
      await persist({ ...a, done: (a.done || []).filter((x) => x !== t.dataset.d) });
      toast(tr('visit.removed'));
    } catch {
      toast(tr('visit.removeFailed'));
    }
  },
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'ptype') {
    $('#planform').dataset.type = e.target.value;
    setText($('#amountlbl'), tr(PLAN_AMOUNT_LABEL[e.target.value]));
  }
});
