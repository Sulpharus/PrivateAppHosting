// Activity editor: photos, opening hours, planned participation. Loaded in order by index.html; all files share one global scope.
/* ---------- editor ---------- */
let draft = null,
  uploads = new Set(),
  removed = new Set(),
  uploading = 0;
function openEditor(a) {
  draft = a
    ? JSON.parse(JSON.stringify(a))
    : {
        id: newId(),
        name: '',
        category: '',
        provider: '',
        description: '',
        location: '',
        address: '',
        equipment: [],
        signup: 'none',
        signupUrl: '',
        signupNotes: '',
        slots: [{ kind: 'weekly', days: [wIdx(parse(S.date))], start: '', end: '' }],
        from: '',
        until: '',
        cost: '',
        level: '',
        contact: '',
        website: '',
        notes: '',
        photos: [],
        thumbs: {},
        done: [],
        planned: { mode: 'none' },
      };
  draft.slots = draft.slots || [];
  draft.photos = draft.photos || [];
  ({ blocks: draft.blocks, singles: draft.singles } = slotsToBlocks(draft.slots));
  if (!draft.blocks.length)
    draft.blocks = [
      { period: { type: 'all' }, rows: [newRow(draft.slots.length ? [] : [wIdx(parse(S.date))])] },
    ];
  draft.planned = draft.planned || { mode: 'none' };
  draft.season = seasonOf(draft) || { type: 'all' };
  if (draft.planned.mode !== 'none' && !draft.planned.season)
    draft.planned.season = planSeason(draft.planned) || { type: 'all' };
  draft.thumbs = draft.thumbs || {};
  draft._addrAtOpen = (draft.address || '').trim();
  draft.courseRows = draft.course
    ? draft.slots
        .filter((s) => s.kind === 'weekly')
        .map((s) => ({ days: [...(s.days || [])], start: s.start || '', end: s.end || '' }))
    : [];
  if (draft.course && !draft.courseRows.length) draft.courseRows = [newRow()];
  if (draft.course && +draft.course.price > 0)
    draft.course.priceText = numF.format(draft.course.price);
  uploads = new Set();
  removed = new Set();
  uploading = 0;
  S.sheet = { type: 'edit', isNew: !a };
  const cats = [...new Set(S.acts.map((x) => x.category).filter(Boolean))].sort();
  const v = (k) => esc(draft[k] || '');
  const opt = (val, label, cur) =>
    `<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(label)}</option>`;
  openSheet(
    `<div class="bar"><button class="btn ghost" data-action="cancel-edit">${esc(tr('action.cancel'))}</button><h2 id="sheet-title">${esc(tr(a ? 'ed.titleEdit' : 'ed.titleNew'))}</h2><span></span></div>
  <nav class="steps" aria-label="${esc(tr('ed.stepsLabel'))}">${steps()
    .map(
      (l, i) =>
        `<button type="button" data-action="step" data-step="${i}"><i>${i + 1}</i>${esc(l)}</button>`,
    )
    .join('')}</nav>
  <form class="form" id="form" novalidate>
    <div class="step" data-step="0">
      <fieldset><legend>${esc(tr('step.basics'))}</legend>
        <label class="f">${esc(tr('ed.name'))}<input name="name" value="${v('name')}" placeholder="${esc(tr('ed.namePh'))}" autocomplete="off" required></label>
        <div class="two"><label class="f">${esc(tr('plan.sport'))}<input name="category" value="${v('category')}" list="cats" placeholder="${esc(tr('ed.sportPh'))}" autocomplete="off"></label>
        <label class="f">${esc(tr('plan.provider'))}<input name="provider" value="${v('provider')}" list="provs" placeholder="${esc(tr('ed.providerPh'))}" autocomplete="off"></label></div>
        <datalist id="provs">${[...new Set(S.acts.map((x) => x.provider).filter(Boolean))]
          .sort()
          .map((c) => `<option value="${esc(c)}">`)
          .join('')}</datalist>
        <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <label class="f">${esc(tr('ed.description'))}<textarea name="description" rows="3" placeholder="${esc(tr('ed.descriptionPh'))}">${v('description')}</textarea></label>
      </fieldset>
      <fieldset><legend>${esc(tr('ed.photos'))}</legend><div class="photos" id="photos"></div><p class="hint">${esc(tr('ed.photosHint'))}</p></fieldset>
    </div>
    <div class="step" data-step="1" hidden>
      <fieldset><legend>${esc(tr('ed.offerType'))}</legend>
        <div class="seg offer-seg" role="group" aria-label="${esc(tr('ed.offerType'))}">${[
          ['open', tr('ed.offerOpen')],
          ['course', tr('ed.offerCourse')],
        ]
          .map(
            ([k, l]) =>
              `<button type="button" data-action="offer-type" data-type="${k}" class="${(k === 'course') === !!draft.course ? 'on' : ''}" aria-pressed="${(k === 'course') === !!draft.course}">${esc(l)}</button>`,
          )
          .join('')}</div>
        <p class="hint">${esc(tr('ed.offerHint'))}</p>
      </fieldset>
      <div id="openbox"${draft.course ? ' hidden' : ''}>
      <fieldset><legend>${esc(tr('ed.openingHours'))}</legend><div id="slots" class="blocks"></div></fieldset>
      <fieldset><legend>${esc(tr('ed.availPeriod'))}</legend><div id="availbox" class="blocks"></div>
        <p class="hint">${esc(tr('ed.availHint'))}</p>
      </fieldset>
      </div>
      <fieldset id="coursefs"${draft.course ? '' : ' hidden'}><legend>${esc(tr('ed.course'))}</legend><div id="coursebox" class="blocks"></div></fieldset>
    </div>
    <div class="step" data-step="2" hidden>
      <fieldset><legend>${esc(tr('ed.plannedAttendance'))}</legend>
        <p class="hint flat" id="coursenote"${draft.course ? '' : ' hidden'}>${esc(tr('ed.courseNote'))}</p>
        <div id="pmodewrap"${draft.course ? ' hidden' : ''}>
        <label class="f">${esc(tr('ed.planAttendance'))}<select id="pmode">${[
          ['none', tr('ed.pmodeNone')],
          ['weekly', tr('ed.pmodeWeekly')],
          ['dates', tr('ed.pmodeDates')],
          ['both', tr('ed.pmodeBoth')],
        ]
          .map(([k, l]) => opt(k, l, (draft.planned && draft.planned.mode) || 'none'))
          .join('')}</select></label>
        <div id="plannedbox" class="blocks"></div>
        </div>
      </fieldset>
      <fieldset><legend>${esc(tr('fact.signup'))}</legend>
        <label class="f">${esc(tr('fact.signup'))}<select name="signup">${Object.entries(SIGNUP)
          .map(([k, l]) => opt(k, tr(l), draft.signup || 'none'))
          .join('')}</select></label>
        <label class="f">${esc(tr('ed.signupLink'))}<input name="signupUrl" type="url" inputmode="url" value="${v('signupUrl')}" placeholder="https://"></label>
        <label class="f">${esc(tr('ed.signupNotes'))}<input name="signupNotes" value="${v('signupNotes')}" placeholder="${esc(tr('ed.signupNotesPh'))}"></label>
      </fieldset>
      <fieldset><legend>${esc(tr('fact.access'))}</legend>
        <div class="checks">
          <label><input type="checkbox" name="acc_guest"${draft.access && draft.access.guest ? ' checked' : ''}><span>${esc(tr('detail.guest'))}</span></label>
          <label><input type="checkbox" name="acc_students"${draft.access && draft.access.students ? ' checked' : ''}><span>${esc(tr('detail.students'))}</span></label>
          <label><input type="checkbox" name="acc_member" id="acc_member"${draft.access && draft.access.membership ? ' checked' : ''}><span>${esc(tr('ed.requiresMembership'))}</span></label>
        </div>
        <div id="memberbox"${draft.access && draft.access.membership ? '' : ' hidden'}>
          ${
            S.plans.length
              ? `<p class="hint indent">${esc(tr('ed.countsTo'))}</p><div class="checks sub">${[
                  ...S.plans,
                ]
                  .sort(
                    (x, y) =>
                      (x.type === 'recurring' ? 0 : 1) - (y.type === 'recurring' ? 0 : 1) ||
                      x.name.localeCompare(y.name, loc()),
                  )
                  .map(
                    (p) =>
                      `<label><input type="checkbox" name="memberof" value="${esc(p.id)}"${(p.activities || []).includes(draft.id) ? ' checked' : ''}><span>${esc(p.name)}<small>${esc([planSummary(p), p.provider].filter(Boolean).join(', '))}</small></span></label>`,
                  )
                  .join('')}</div>
            <p class="hint indent">${esc(tr('ed.memberLinkHint'))}</p>`
              : `<p class="hint indent">${esc(tr('ed.noPlansHint'))}</p>`
          }
        </div>
      </fieldset>
    </div>
    <div class="step" data-step="3" hidden>
      <fieldset><legend>${esc(tr('ed.place'))}</legend>
        <label class="f">${esc(tr('ed.place'))}<input name="location" value="${v('location')}" placeholder="${esc(tr('ed.placePh'))}"></label>
        <label class="f">${esc(tr('ed.address'))}<input name="address" value="${v('address')}" placeholder="${esc(tr('ed.addressPh'))}" autocomplete="street-address"></label>
        <div id="geobox" class="geobox" aria-live="polite"></div>
      </fieldset>
      <fieldset><legend>${esc(tr('ed.costsAndPrep'))}</legend>
        <div class="two"><label class="f">${esc(tr('plan.amount.visit'))}<input name="visitPrice" inputmode="decimal" value="${+draft.visitPrice > 0 ? esc(numF.format(draft.visitPrice)) : ''}" placeholder="${esc(tr('plan.amountPlaceholder'))}" autocomplete="off"></label>
        <label class="f">${esc(tr('ed.costNote'))}<input name="cost" value="${v('cost')}" placeholder="${esc(tr('ed.costNotePh'))}"></label></div>
        <p class="hint">${esc(tr('ed.priceHint'))}</p>
        <label class="f">${esc(tr('fact.level'))}<select name="level">${Object.entries(LEVELS)
          .map(([k, l]) => opt(k, tr(l), draft.level || ''))
          .join('')}</select></label>
        <label class="f">${esc(tr('ed.equipment'))}<input name="equipment" value="${esc((draft.equipment || []).join(', '))}" placeholder="${esc(tr('ed.equipmentPh'))}"></label>
      </fieldset>
      <details class="more"${draft.contact || draft.website || draft.notes ? ' open' : ''}><summary>${esc(tr('ed.contactSummary'))}</summary><div>
        <label class="f">${esc(tr('fact.contact'))}<input name="contact" value="${v('contact')}" placeholder="${esc(tr('ed.contactPh'))}"></label>
        <label class="f">${esc(tr('fact.website'))}<input name="website" type="url" inputmode="url" value="${v('website')}" placeholder="https://"></label>
        <label class="f">${esc(tr('plan.notes'))}<textarea name="notes" rows="3">${v('notes')}</textarea></label>
      </div></details>
    </div>
    <p class="err" id="err" role="alert" hidden></p>
  </form>
  <div class="sheet-foot"><button type="button" class="btn ghost" data-action="step-prev" id="prevbtn">${esc(tr('ed.back'))}</button><span class="grow"></span><button type="button" class="btn" data-action="step-next" id="nextbtn">${esc(tr('ed.next'))}</button><button type="button" class="btn primary" data-action="save">${esc(tr(a ? 'ed.save' : 'ed.create'))}</button></div>`,
    true,
  );
  renderSlots();
  renderCourse();
  renderGeo();
  renderPhotos();
  renderPlanned();
  renderAvail();
  setStep(0);
  if (!a) setTimeout(() => document.querySelector('[name=name]')?.focus(), 300);
}
/* the editor is split into steps; all fields stay in one form, so saving works from any step */
const steps = () => [
  tr('step.basics'),
  tr('step.times'),
  tr('step.attendance'),
  tr('step.details'),
];
function setStep(i) {
  if (!S.sheet || S.sheet.type !== 'edit') return;
  S.sheet.step = i;
  for (const el of document.querySelectorAll('#form .step')) el.hidden = +el.dataset.step !== i;
  document.querySelectorAll('.steps button').forEach((b, k) => {
    if (k === i) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
    b.classList.toggle('seen', k < i);
  });
  $('#prevbtn').hidden = i === 0;
  $('#nextbtn').hidden = i === steps().length - 1;
  const sheet = $('.sheet');
  if (sheet) sheet.scrollTop = 0;
}
const monthNames = () =>
  [...Array(12)].map((_, m) => fmt(new Date(2000, m, 1), { month: 'short' }));
/* shared editor for a period: open-ended, yearly (day + month) or a fixed date range */
const toYearly = (p) => ({
  ...p,
  type: 'yearly',
  from: p.from ? p.from.slice(-5) : '05-01',
  until: p.until ? p.until.slice(-5) : '09-30',
});
function toRange(p) {
  const yr = new Date().getFullYear(),
    f = p.from ? p.from.slice(-5) : '05-01',
    u = p.until ? p.until.slice(-5) : '09-30';
  return { ...p, type: 'range', from: `${yr}-${f}`, until: `${u < f ? yr + 1 : yr}-${u}` };
}
// Stored period label of a course (kept for existing data); shown in the active language.
const COURSE_LABEL = 'Kurs';
const labelText = (label) => (label === COURSE_LABEL ? tr('period.course') : label || '');
const yearlyCheck = (attr, on) =>
  `<label class="yearly-check"><input type="checkbox" ${attr}${on ? ' checked' : ''}>${esc(tr('ed.repeatYearly'))}</label>`;
const seasonOpts = (scope) => [
  ['all', tr(scope === 'avail' ? 'ed.seasonAvailAll' : 'ed.seasonPlanAll')],
  ['period', tr('ed.seasonPeriod')],
];
const seasonObj = (scope) => (scope === 'avail' ? draft.season : draft.planned.season);
function mdSelects(scope, key, val) {
  const [m, d] = (val || '01-01').split('-').map(Number);
  return `<span class="md"><select data-smd="${scope}" data-key="${key}" data-part="d" aria-label="${esc(tr('ed.day'))}">${[...Array(31)].map((_, k) => `<option value="${k + 1}"${k + 1 === d ? ' selected' : ''}>${esc(tr('ed.dayOption', { n: k + 1 }))}</option>`).join('')}</select><select data-smd="${scope}" data-key="${key}" data-part="m" aria-label="${esc(tr('ed.month'))}">${monthNames()
    .map((l, k) => `<option value="${k + 1}"${k + 1 === m ? ' selected' : ''}>${esc(l)}</option>`)
    .join('')}</select></span>`;
}
function seasonEditor(scope, label) {
  const p = seasonObj(scope) || { type: 'all' },
    t = p.type || 'all';
  return `<label class="f">${label}<select data-season="${scope}">${seasonOpts(scope)
    .map(
      ([k, l]) =>
        `<option value="${k}"${(k === 'all') === (t === 'all') ? ' selected' : ''}>${esc(l)}</option>`,
    )
    .join('')}</select></label>
    ${t !== 'all' ? yearlyCheck(`data-syearly="${scope}"`, t === 'yearly') : ''}
    ${t === 'yearly' ? `<div class="two"><label class="f">${esc(tr('ed.from'))}${mdSelects(scope, 'from', p.from)}</label><label class="f">${esc(tr('ed.until'))}${mdSelects(scope, 'until', p.until)}</label></div>` : ''}
    ${t === 'range' ? `<div class="two"><label class="f">${esc(tr(scope === 'plan' ? 'ed.fromPlan' : 'ed.from'))}<input type="date" data-sdate="${scope}" data-key="from" value="${esc(p.from || '')}"></label><label class="f">${esc(tr('ed.until'))}<input type="date" data-sdate="${scope}" data-key="until" value="${esc(p.until || '')}"></label></div>` : ''}`;
}
const renderAvail = () => {
  const el = $('#availbox');
  if (el) el.innerHTML = seasonEditor('avail', tr('ed.availableLabel'));
};
function rerenderSeason(scope) {
  scope === 'avail' ? renderAvail() : renderPlanned();
}
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!draft || !t.dataset) return;
  if (t.dataset.season) {
    const scope = t.dataset.season,
      old = seasonObj(scope) || {};
    const next =
      t.value === 'all'
        ? { type: 'all' }
        : old.type === 'yearly' || old.type === 'range'
          ? old
          : { type: 'yearly', from: '05-01', until: '09-30' };
    if (scope === 'avail') draft.season = next;
    else draft.planned.season = next;
    rerenderSeason(scope);
  } else if (t.dataset.syearly) {
    const scope = t.dataset.syearly,
      cur = seasonObj(scope),
      next = t.checked ? toYearly(cur) : toRange(cur);
    if (scope === 'avail') draft.season = next;
    else draft.planned.season = next;
    rerenderSeason(scope);
  } else if (t.dataset.smd) {
    const p = seasonObj(t.dataset.smd),
      key = t.dataset.key;
    let [m, d] = (p[key] || '01-01').split('-').map(Number);
    if (t.dataset.part === 'd') d = +t.value;
    else m = +t.value;
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1],
      clamp = d > max;
    p[key] = `${pad(m)}-${pad(clamp ? max : d)}`;
    if (clamp) rerenderSeason(t.dataset.smd);
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (draft && t.dataset && t.dataset.sdate) seasonObj(t.dataset.sdate)[t.dataset.key] = t.value;
});
function renderPlanned() {
  const p = draft.planned || { mode: 'none' },
    el = $('#plannedbox');
  if (!el) return;
  const reg = p.mode === 'weekly' || p.mode === 'both',
    dat = p.mode === 'dates' || p.mode === 'both';
  el.innerHTML =
    (p.mode === 'none' ? `<p class="hint flat">${esc(tr('ed.plannedHint'))}</p>` : '') +
    (reg
      ? `<div class="slot"><div class="daypick">${DAYS()
          .map(
            (d, j) =>
              `<button type="button" class="${(p.days || []).includes(j) ? 'on' : ''}" data-action="pday" data-j="${j}" aria-pressed="${(p.days || []).includes(j)}">${esc(d)}</button>`,
          )
          .join('')}</div>
      <label class="f">${esc(tr('ed.rhythm'))}<select data-pf="every">${[1, 2, 3, 4].map((n) => `<option value="${n}"${(+p.every || 1) === n ? ' selected' : ''}>${esc(n === 1 ? tr('ed.everyWeek') : tr('ed.everyNWeeks', { n }))}</option>`).join('')}</select></label>
      ${seasonEditor('plan', tr('ed.periodLabel'))}
      <p class="hint flat">${esc(tr('ed.plannedDaysHint'))}</p></div>`
      : '') +
    (dat
      ? `<div class="slot"><span class="f">${esc(tr('ed.singleDates'))}</span>${(p.dates || []).length ? `<div class="pdates">${p.dates.map((d) => `<span class="tag">${fmt(parse(d), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}<button type="button" class="vx" data-action="pdate-del" data-d="${esc(d)}" aria-label="${esc(tr('ed.removeDate'))}">×</button></span>`).join('')}</div>` : ''}
      <div class="padd-row"><input type="date" id="pdate" value="${esc(S.date >= todayStr() ? S.date : todayStr())}" aria-label="${esc(tr('ed.date'))}"><button type="button" class="btn" data-action="pdate-add">${esc(tr('action.add'))}</button></div></div>`
      : '');
}
/* opening hours are edited as blocks: one block per period (whole year, a season, ...), each with its own weekly times */
const perKey = (p) =>
  !p || !p.type || p.type === 'all' ? 'all' : [p.type, p.from, p.until, p.label || ''].join('|');
function slotsToBlocks(slots) {
  const blocks = [],
    map = new Map(),
    singles = [];
  for (const sl of slots || []) {
    if (sl.kind === 'date') {
      singles.push({ date: sl.date || '', start: sl.start || '', end: sl.end || '' });
      continue;
    }
    const k = perKey(sl.period);
    if (!map.has(k)) {
      const b = {
        period: sl.period && sl.period.type !== 'all' ? { ...sl.period } : { type: 'all' },
        rows: [],
      };
      map.set(k, b);
      blocks.push(b);
    }
    map.get(k).rows.push({ days: [...(sl.days || [])], start: sl.start || '', end: sl.end || '' });
  }
  blocks.sort((x, y) => (x.period.type === 'all' ? 0 : 1) - (y.period.type === 'all' ? 0 : 1));
  return { blocks, singles };
}
const newRow = (days) => ({ days: days || [], start: '', end: '' });
function blockTitle(b) {
  const p = b.period;
  if (p.type === 'all') return `<b>${esc(tr('when.allYear'))}</b>`;
  const r = periodLabel({ ...p, label: '' });
  return `<span><b>${esc(labelText(p.label) || tr('ed.periodDefault'))}</b><small>${esc(r)}</small></span>`;
}
function blockHead(b, i) {
  const p = b.period,
    t = p.type;
  const md = (key, part) => {
    const [m, d] = (p[key] || '01-01').split('-').map(Number);
    return part === 'd'
      ? `<select data-bmd="${i}" data-key="${key}" data-part="d" aria-label="${esc(tr('ed.day'))}">${[...Array(31)].map((_, k) => `<option value="${k + 1}"${k + 1 === d ? ' selected' : ''}>${esc(tr('ed.dayOption', { n: k + 1 }))}</option>`).join('')}</select>`
      : `<select data-bmd="${i}" data-key="${key}" data-part="m" aria-label="${esc(tr('ed.month'))}">${monthNames()
          .map(
            (l, k) =>
              `<option value="${k + 1}"${k + 1 === m ? ' selected' : ''}>${esc(l)}</option>`,
          )
          .join('')}</select>`;
  };
  return `<div class="blk-head">
    <label class="f">${esc(tr('ed.appliesTo'))}<select data-bper="${i}">${[
      ['all', tr('when.allYear')],
      ['period', tr('ed.seasonPeriod')],
    ]
      .map(
        ([k, l]) =>
          `<option value="${k}"${(k === 'all') === (t === 'all') ? ' selected' : ''}>${esc(l)}</option>`,
      )
      .join('')}</select></label>
    ${t !== 'all' ? yearlyCheck(`data-byearly="${i}"`, t === 'yearly') : ''}
    ${t === 'yearly' ? `<div class="two"><label class="f">${esc(tr('ed.from'))}<span class="md">${md('from', 'd')}${md('from', 'm')}</span></label><label class="f">${esc(tr('ed.until'))}<span class="md">${md('until', 'd')}${md('until', 'm')}</span></label></div>` : ''}
    ${t === 'range' ? `<div class="two"><label class="f">${esc(tr('ed.from'))}<input type="date" data-f="per" data-b="${i}" data-k="from" value="${esc(p.from || '')}"></label><label class="f">${esc(tr('ed.until'))}<input type="date" data-f="per" data-b="${i}" data-k="until" value="${esc(p.until || '')}"></label></div>` : ''}
    ${t !== 'all' ? `<label class="f">${esc(tr('ed.label'))}<input data-f="per" data-b="${i}" data-k="label" value="${esc(labelText(p.label))}" placeholder="${esc(tr('ed.labelPh'))}"></label>` : ''}
  </div>`;
}
const DEL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function renderSlots() {
  const el = $('#slots');
  if (!el || !draft) return;
  const B = draft.blocks,
    S1 = draft.singles;
  el.innerHTML =
    B.map(
      (b, i) => `<div class="blk">
      <div class="blk-title">${blockTitle(b)}</div>
      ${blockHead(b, i)}
      ${b.rows
        .map(
          (r, j) => `<div class="trow">
        <div class="daypick">${DAYS()
          .map(
            (d, k) =>
              `<button type="button" class="${r.days.includes(k) ? 'on' : ''}" data-action="row-day" data-b="${i}" data-r="${j}" data-j="${k}" aria-pressed="${r.days.includes(k)}">${esc(d)}</button>`,
          )
          .join('')}</div>
        <div class="ttimes"><label class="f">${esc(tr('ed.start'))}<input type="time" data-f="row" data-b="${i}" data-r="${j}" data-k="start" value="${esc(r.start)}"></label><label class="f">${esc(tr('ed.end'))}<input type="time" data-f="row" data-b="${i}" data-r="${j}" data-k="end" value="${esc(r.end)}"></label>
        ${b.rows.length > 1 ? `<button type="button" class="icon" data-action="row-del" data-b="${i}" data-r="${j}" aria-label="${esc(tr('ed.removeTime'))}">${DEL_ICON}</button>` : '<span></span>'}</div>
      </div>`,
        )
        .join('')}
      <div class="blk-actions"><button type="button" class="btn plus" data-action="row-add" data-b="${i}">${esc(tr(b.period.type === 'all' ? 'ed.addTime' : 'ed.addTimeInPeriod'))}</button>
        <span>${b.period.type === 'all' ? `<button type="button" class="btn" data-action="blk-split" data-b="${i}">${esc(tr('ed.splitSeasons'))}</button>` : ''}${B.length > 1 ? `<button type="button" class="btn danger" data-action="blk-del" data-b="${i}">${esc(tr('ed.removeBlock'))}</button>` : ''}</span></div>
    </div>`,
    ).join('') +
    `<button type="button" class="btn" data-action="blk-add">${esc(tr('ed.addBlock'))}</button>` +
    `<div class="blk"><div class="blk-title"><b>${esc(tr('when.singles'))}</b></div>
      ${
        S1.length
          ? S1.map(
              (
                x,
                k,
              ) => `<div class="trow"><div class="ttimes single"><label class="f">${esc(tr('ed.dateLabel'))}<input type="date" data-f="single" data-s="${k}" data-k="date" value="${esc(x.date)}"></label><button type="button" class="icon" data-action="single-del" data-s="${k}" aria-label="${esc(tr('ed.removeDate'))}">${DEL_ICON}</button></div>
        <div class="two"><label class="f">${esc(tr('ed.start'))}<input type="time" data-f="single" data-s="${k}" data-k="start" value="${esc(x.start)}"></label><label class="f">${esc(tr('ed.end'))}<input type="time" data-f="single" data-s="${k}" data-k="end" value="${esc(x.end)}"></label></div></div>`,
            ).join('')
          : `<p class="hint flat">${esc(tr('ed.singlesHint'))}</p>`
      }
      <div class="blk-actions"><button type="button" class="btn plus" data-action="single-add">${esc(tr('ed.addSingle'))}</button></div></div>`;
}
function fieldSync(t) {
  if (!draft || !t.dataset || !t.dataset.f) return;
  const { f, b, r, k, s: si } = t.dataset;
  if (f === 'row') draft.blocks[+b].rows[+r][k] = t.value;
  else if (f === 'per') draft.blocks[+b].period[k] = t.value;
  else if (f === 'single') draft.singles[+si][k] = t.value;
}
const syncSlotsDOM = () => {
  if (draft && draft.blocks) document.querySelectorAll('#slots [data-f]').forEach(fieldSync);
};
document.addEventListener('input', (e) => fieldSync(e.target));
document.addEventListener('change', (e) => {
  const t = e.target;
  syncSlotsDOM();
  if (!draft || !t.dataset) return;
  if (t.dataset.bper !== undefined) {
    const b = draft.blocks[+t.dataset.bper],
      old = b.period;
    b.period =
      t.value === 'all'
        ? { type: 'all' }
        : old.type !== 'all'
          ? old
          : { type: 'yearly', from: '04-01', until: '09-30', label: '' };
    renderSlots();
  } else if (t.dataset.byearly !== undefined) {
    const b = draft.blocks[+t.dataset.byearly];
    b.period = t.checked ? toYearly(b.period) : toRange(b.period);
    renderSlots();
  } else if (t.dataset.bmd !== undefined) {
    const p = draft.blocks[+t.dataset.bmd].period,
      key = t.dataset.key;
    let [m, d] = (p[key] || '01-01').split('-').map(Number);
    if (t.dataset.part === 'd') d = +t.value;
    else m = +t.value;
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
    p[key] = `${pad(m)}-${pad(Math.min(d, max))}`;
    renderSlots(); // refresh the block title with the new dates
  }
});
/* flatten blocks back into slots; returns an error message or null */
function blocksToSlots() {
  syncSlotsDOM(); // take whatever is on screen, even if a picker fired no event
  const out = [];
  for (const b of draft.blocks) {
    const p = b.period,
      rows = b.rows.filter((r) => r.days.length);
    if (!rows.length) continue;
    if (p.type === 'range') {
      if (!p.from && !p.until) return tr('ed.errRangeNeeds');
      if (p.from && p.until && p.until < p.from) return tr('ed.errRangeOrder');
    }
    const per =
      p.type === 'all'
        ? null
        : p.type === 'yearly'
          ? { type: 'yearly', from: p.from, until: p.until, label: (p.label || '').trim() }
          : {
              type: 'range',
              from: p.from || '',
              until: p.until || '',
              label: (p.label || '').trim(),
            };
    for (const r of rows) {
      const o = {
        kind: 'weekly',
        days: [...r.days].sort(),
        start: r.start || '',
        end: r.end || '',
      };
      if (per) o.period = per;
      out.push(o);
    }
  }
  for (const x of draft.singles)
    if (x.date) out.push({ kind: 'date', date: x.date, start: x.start || '', end: x.end || '' });
  draft.slots = out;
  return null;
}
/* a course: start and end date, weekly training times; all sessions are planned */
const dayCount = (from, until) => Math.round((parse(until) - parse(from)) / 864e5) + 1;
function courseSessions() {
  const c = draft.course;
  if (!c || !c.from || !c.until || c.until < c.from) return 0;
  const days = new Set(draft.courseRows.flatMap((r) => r.days));
  let n = 0;
  for (let d = parse(c.from), i = 0; ymd(d) <= c.until && i < 800; d = addDays(d, 1), i++)
    if (days.has(wIdx(d))) n++;
  return n;
}
/* € per session in the editor, by the same rule as everywhere else (js/price.js) */
function coursePriceNote() {
  const c = draft.course;
  if (!c.from || !c.until || c.until < c.from) return '';
  const days = new Set(draft.courseRows.flatMap((r) => r.days)),
    dates = [];
  for (let d = parse(c.from), i = 0; ymd(d) <= c.until && i < 800; d = addDays(d, 1), i++)
    if (days.has(wIdx(d))) dates.push(ymd(d));
  const cp = splitCoursePrice(
    { price: parseEuro(c.priceText), priceType: c.priceType },
    dates,
    new Set(draft.cancelled || []),
  );
  if (!cp) return '';
  const span = cp.type === 'month' ? ` ${tr('ed.courseSpan', { n: cp.months })}` : '';
  const off = cp.cancelled ? ` ${tr('ed.courseOff', { n: cp.cancelled })}` : '';
  const avg = cp.avg !== null ? `, ${tr('detail.courseAvg', { price: eur(cp.avg) })}` : '';
  return tr('ed.coursePriceNote', { total: eur(cp.total), span, avg, off });
}
function courseSummary() {
  const c = draft.course,
    n = courseSessions();
  if (!c.from || !c.until) return tr('ed.courseNeedDates');
  if (c.until < c.from) return tr('ed.courseEndBefore');
  if (!n) return tr('ed.courseNeedDay');
  const note = coursePriceNote();
  return (
    tr('ed.courseSummary', { n, from: dLabel(c.from), until: dLabel(c.until) }) +
    (note ? ` ${note}` : '')
  );
}
function renderCourse() {
  const el = $('#coursebox');
  if (!el || !draft || !draft.course) return;
  const c = draft.course,
    weeks = c.from && c.until && c.until >= c.from ? Math.ceil(dayCount(c.from, c.until) / 7) : '';
  el.innerHTML = `<div class="blk">
      <div class="two"><label class="f">${esc(tr('ed.courseStart'))}<input type="date" data-cf="from" value="${esc(c.from || '')}"></label>
      <label class="f">${esc(tr('ed.courseEnd'))}<input type="date" data-cf="until" value="${esc(c.until || '')}"></label></div>
      <label class="f">${esc(tr('ed.courseWeeks'))}<input type="number" min="1" max="104" inputmode="numeric" data-cf="weeks" value="${weeks}" placeholder="${esc(tr('ed.courseWeeksPh'))}"></label>
      <p class="hint flat">${esc(tr('ed.courseWeeksHint'))}</p>
    </div>
    <div class="blk"><div class="blk-title"><b>${esc(tr('ed.coursePrice'))}</b></div>
      <div class="two"><label class="f">${esc(tr('ed.priceIn'))}<input data-cf="priceText" inputmode="decimal" autocomplete="off" placeholder="${esc(tr('ed.pricePh'))}" value="${esc(c.priceText || '')}"></label>
      <label class="f">${esc(tr('ed.appliesToPrice'))}<select data-cf="priceType"><option value="total"${c.priceType === 'month' ? '' : ' selected'}>${esc(tr('ed.priceTotal'))}</option><option value="month"${c.priceType === 'month' ? ' selected' : ''}>${esc(tr('ed.priceMonth'))}</option></select></label></div>
      <p class="hint flat">${esc(tr('ed.coursePriceHint'))}</p>
    </div>
    <div class="blk"><div class="blk-title"><b>${esc(tr('ed.trainingDays'))}</b></div>
      ${draft.courseRows
        .map(
          (r, j) => `<div class="trow">
        <div class="daypick">${DAYS()
          .map(
            (d, k) =>
              `<button type="button" class="${r.days.includes(k) ? 'on' : ''}" data-action="crow-day" data-r="${j}" data-j="${k}" aria-pressed="${r.days.includes(k)}">${esc(d)}</button>`,
          )
          .join('')}</div>
        <div class="ttimes"><label class="f">${esc(tr('ed.start'))}<input type="time" data-cf="row" data-r="${j}" data-k="start" value="${esc(r.start)}"></label><label class="f">${esc(tr('ed.end'))}<input type="time" data-cf="row" data-r="${j}" data-k="end" value="${esc(r.end)}"></label>
        ${draft.courseRows.length > 1 ? `<button type="button" class="icon" data-action="crow-del" data-r="${j}" aria-label="${esc(tr('ed.removeTraining'))}">${DEL_ICON}</button>` : '<span></span>'}</div>
      </div>`,
        )
        .join('')}
      <div class="blk-actions"><button type="button" class="btn plus" data-action="crow-add">${esc(tr('ed.addTraining'))}</button></div>
    </div>
    <p class="hint flat" id="coursesum" role="status">${esc(courseSummary())}</p>`;
}
function courseFieldSync(t) {
  if (!draft || !draft.course || !t.dataset || !t.dataset.cf) return;
  const c = draft.course,
    f = t.dataset.cf;
  if (f === 'row') draft.courseRows[+t.dataset.r][t.dataset.k] = t.value;
  else if (f === 'weeks') {
    // only a helper that fills in Kursende
    const w = Math.round(+t.value);
    if (!c.from || !(w >= 1 && w <= 104)) return;
    c.until = ymd(addDays(parse(c.from), w * 7 - 1));
    const u = $('[data-cf=until]');
    if (u) u.value = c.until;
  } else {
    c[f] = t.value;
    const w = $('[data-cf=weeks]');
    if (w && document.activeElement !== w)
      w.value =
        c.from && c.until && c.until >= c.from ? Math.ceil(dayCount(c.from, c.until) / 7) : '';
  }
  const sum = $('#coursesum');
  if (sum) setText(sum, courseSummary());
}
document.addEventListener('input', (e) => courseFieldSync(e.target));
function showOfferType() {
  const course = !!draft.course;
  $('#openbox').hidden = course;
  $('#coursefs').hidden = !course;
  $('#coursenote').hidden = !course;
  $('#pmodewrap').hidden = course;
  document.querySelectorAll('[data-action=offer-type]').forEach((b) => {
    const on = (b.dataset.type === 'course') === course;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}
/* turns the course into weekly slots over its dates and plans every session; error or null */
function courseToSlots() {
  document
    .querySelectorAll(
      '#coursebox [data-cf=from], #coursebox [data-cf=until], #coursebox [data-cf=row], #coursebox [data-cf=priceText], #coursebox [data-cf=priceType]',
    )
    .forEach(courseFieldSync);
  const c = draft.course,
    rows = draft.courseRows.filter((r) => r.days.length);
  if (!c.from || !c.until) return tr('ed.courseNeedDates');
  if (c.until < c.from) return tr('ed.courseEndBefore');
  const priceText = String(c.priceText || '').trim();
  if (priceText && !(parseEuro(priceText) >= 0 && parseEuro(priceText) <= 100000))
    return tr('ed.errCoursePrice');
  if (dayCount(c.from, c.until) > 104 * 7) return tr('ed.errCourseLong');
  if (!rows.length) return tr('ed.errCourseDay');
  const period = { type: 'range', from: c.from, until: c.until, label: COURSE_LABEL };
  draft.slots = rows.map((r) => ({
    kind: 'weekly',
    days: [...r.days].sort(),
    start: r.start || '',
    end: r.end || '',
    period,
  }));
  // single dates (e.g. an extra session) stay
  for (const x of draft.singles)
    if (x.date)
      draft.slots.push({ kind: 'date', date: x.date, start: x.start || '', end: x.end || '' });
  draft.season = { type: 'range', from: c.from, until: c.until };
  const pp = draft.planned || {};
  draft.planned = {
    ...pp,
    mode: (pp.dates || []).length ? 'both' : 'weekly',
    days: [...new Set(rows.flatMap((r) => r.days))].sort(),
    every: 1,
    season: { type: 'range', from: c.from, until: c.until },
    anchor: c.from,
  };
  const price = parseEuro(c.priceText);
  draft.course = {
    from: c.from,
    until: c.until,
    ...(price > 0
      ? {
          price: Math.round(price * 100) / 100,
          priceType: c.priceType === 'month' ? 'month' : 'total',
        }
      : {}),
  };
  return null;
}
const BLOCK_HANDLERS = {
  'offer-type': (t) => {
    const course = t.dataset.type === 'course';
    if (course === !!draft.course) return;
    if (course) {
      syncSlotsDOM();
      const from = S.date >= todayStr() ? S.date : todayStr();
      draft.course = draft._course || { from, until: ymd(addDays(parse(from), 10 * 7 - 1)) };
      if (!draft.courseRows.length) {
        // one row per distinct time, merged over seasonal blocks
        const byTime = new Map();
        for (const r of draft.blocks.flatMap((b) => b.rows).filter((x) => x.days.length)) {
          const k = `${r.start}|${r.end}`,
            cur = byTime.get(k);
          byTime.set(
            k,
            cur
              ? { ...cur, days: [...new Set([...cur.days, ...r.days])] }
              : { ...r, days: [...r.days] },
          );
        }
        draft.courseRows = byTime.size ? [...byTime.values()] : [newRow([wIdx(parse(from))])];
      }
      renderCourse();
    } else {
      document.querySelectorAll('#coursebox [data-cf]').forEach(courseFieldSync);
      draft._course = draft.course;
      draft.course = null;
      // open times plan as chosen in step 3 again; start from "not planned" if it was the course plan
      if (
        draft.planned &&
        draft.planned.mode !== 'none' &&
        (draft.planned.season || {}).type === 'range' &&
        draft._course &&
        draft.planned.season.from === draft._course.from
      )
        draft.planned = {
          mode: (draft.planned.dates || []).length ? 'dates' : 'none',
          dates: draft.planned.dates || [],
          skip: draft.planned.skip || [],
        };
      const pm = $('#pmode');
      if (pm) pm.value = draft.planned.mode || 'none';
      renderPlanned();
      renderAvail();
    }
    showOfferType();
    t.focus();
  },
  'crow-day': (t) => {
    const r = draft.courseRows[+t.dataset.r],
      k = +t.dataset.j;
    r.days = r.days.includes(k) ? r.days.filter((x) => x !== k) : [...r.days, k];
    t.classList.toggle('on', r.days.includes(k));
    t.setAttribute('aria-pressed', r.days.includes(k));
    setText($('#coursesum'), courseSummary());
  },
  'crow-add': () => {
    document.querySelectorAll('#coursebox [data-cf=row]').forEach(courseFieldSync);
    draft.courseRows.push(newRow());
    renderCourse();
    $(`[data-action=crow-day][data-r="${draft.courseRows.length - 1}"]`)?.focus();
  },
  'crow-del': (t) => {
    document.querySelectorAll('#coursebox [data-cf=row]').forEach(courseFieldSync);
    draft.courseRows.splice(+t.dataset.r, 1);
    renderCourse();
    $('[data-action=crow-add]')?.focus();
  },
  step: (t) => setStep(+t.dataset.step),
  'step-next': () => setStep(Math.min(steps().length - 1, S.sheet.step + 1)),
  'step-prev': () => setStep(Math.max(0, S.sheet.step - 1)),
  'row-day': (t) => {
    const r = draft.blocks[+t.dataset.b].rows[+t.dataset.r],
      k = +t.dataset.j;
    r.days = r.days.includes(k) ? r.days.filter((x) => x !== k) : [...r.days, k];
    t.classList.toggle('on', r.days.includes(k));
    t.setAttribute('aria-pressed', r.days.includes(k));
  },
  'row-add': (t) => {
    draft.blocks[+t.dataset.b].rows.push(newRow());
    renderSlots();
  },
  'row-del': (t) => {
    draft.blocks[+t.dataset.b].rows.splice(+t.dataset.r, 1);
    renderSlots();
  },
  'blk-add': () => {
    draft.blocks.push({
      period: { type: 'yearly', from: '10-01', until: '03-31', label: '' },
      rows: [newRow()],
    });
    renderSlots();
  },
  'blk-del': (t) => {
    draft.blocks.splice(+t.dataset.b, 1);
    renderSlots();
  },
  'blk-split': (t) => {
    const b = draft.blocks[+t.dataset.b];
    const winter = {
      period: { type: 'yearly', from: '10-01', until: '03-31', label: tr('ed.blockWinter') },
      rows: b.rows.map((r) => ({ ...r, days: [...r.days] })),
    };
    b.period = { type: 'yearly', from: '04-01', until: '09-30', label: tr('ed.blockSummer') };
    draft.blocks.splice(+t.dataset.b + 1, 0, winter);
    renderSlots();
    toast(tr('ed.splitToast'));
  },
  'single-add': () => {
    draft.singles.push({ date: S.date, start: '', end: '' });
    renderSlots();
  },
  'single-del': (t) => {
    draft.singles.splice(+t.dataset.s, 1);
    renderSlots();
  },
};
function renderPhotos() {
  const el = $('#photos');
  if (!el || !draft) return;
  patchList(el, [
    ...draft.photos.map((p, i) => ({
      key: 'p' + p.slice(-40) + i,
      html: `<div class="pslot"><button type="button" data-action="photo-cover" data-i="${i}" aria-label="${esc(tr('ed.setCover'))}"><img src="${esc(thumbSrc(draft, p))}" alt="" decoding="async"></button>${i === 0 ? `<span class="cover">${esc(tr('ed.cover'))}</span>` : ''}<button type="button" class="x" data-action="photo-del" data-i="${i}" aria-label="${esc(tr('ed.removePhoto'))}">${ICON.close}</button></div>`,
    })),
    ...(uploading
      ? [{ key: 'busy', html: `<div class="pslot busy">${esc(tr('ed.photoAdding'))}</div>` }]
      : []),
    {
      key: 'add',
      html: `<label class="pslot padd">${ICON.camera}${esc(tr('ed.addPhoto'))}<input type="file" accept="image/*" multiple id="file"></label>`,
    },
  ]);
}
/* decode off the main thread where the browser allows it */
async function decode(blob) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(blob);
    } catch {}
  }
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
function scaleTo(img, max, q, asBlob) {
  const w0 = img.naturalWidth || img.width,
    h0 = img.naturalHeight || img.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w0 * k);
  cv.height = Math.round(h0 * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return asBlob ? new Promise((r) => cv.toBlob(r, 'image/jpeg', q)) : cv.toDataURL('image/jpeg', q);
}
async function addPhotos(files) {
  for (const f of files) {
    uploading++;
    renderPhotos();
    try {
      const st = await storeImage(f);
      if (st.thumb) {
        uploads.add(st.ref);
        uploads.add(st.thumb);
      }
      if (draft) {
        draft.photos.push(st.ref);
        if (st.thumb) draft.thumbs[st.ref] = st.thumb;
      }
    } catch (e) {
      toast(
        e && e.code === 'quota_or_state'
          ? tr('ed.photoFull')
          : e && e.code === 'too_large'
            ? tr('ed.photoTooLarge')
            : tr('ed.photoFailed'),
      );
    } finally {
      uploading--;
      renderPhotos();
    }
  }
}
function collectForm() {
  const fd = new FormData($('#form'));
  for (const k of [
    'name',
    'category',
    'provider',
    'description',
    'location',
    'address',
    'signup',
    'signupUrl',
    'signupNotes',
    'cost',
    'level',
    'contact',
    'website',
    'notes',
  ])
    draft[k] = String(fd.get(k) || '').trim();
  const vp = parseMoney(fd.get('visitPrice'));
  draft.visitPrice = vp > 0 ? vp : 0;
  draft.access = {
    guest: fd.has('acc_guest'),
    students: fd.has('acc_students'),
    membership: fd.has('acc_member'),
  };
  draft._memberOf = fd.getAll('memberof');
  draft.equipment = String(fd.get('equipment') || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}
const normUrl = (u) => (u && !/^https?:\/\//i.test(u) ? 'https://' + u : u);
const dropAsset = (r) => {
  if (r && !r.startsWith('data:')) ready.then((mn) => mn.files.remove(r)).catch(() => {});
};
let saving = false;
/* one save at a time: the address check can take a few seconds */
async function saveDraft() {
  if (saving) return;
  saving = true;
  const btn = $('[data-action=save]'),
    label = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = tr('ed.saving');
  }
  try {
    await saveDraftNow();
  } finally {
    saving = false;
    if (btn && btn.isConnected) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
}
async function saveDraftNow() {
  collectForm();
  const err = $('#err');
  const fail = (m, step) => {
    if (step !== undefined) setStep(step);
    err.textContent = m;
    err.hidden = false;
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  if (!draft.name) return fail(tr('ed.errName'), 0);
  if (
    String(new FormData($('#form')).get('visitPrice') || '').trim() &&
    !(parseMoney(new FormData($('#form')).get('visitPrice')) >= 0)
  )
    return fail(tr('ed.errVisitPrice'), 3);
  if (uploading) return fail(tr('ed.errUploading'), 0);
  if (draft.from && draft.until && draft.until < draft.from)
    return fail(tr('ed.errEndBeforeStart'), 1);
  const slotErr = draft.course ? courseToSlots() : blocksToSlots();
  if (slotErr) return fail(slotErr, 1);
  const pp = draft.planned;
  if (pp.mode === 'weekly' || pp.mode === 'both') {
    if (!(pp.days || []).length) return fail(tr('ed.errWeekday'), 2);
  }
  const badRange = (x) => x && x.type === 'range' && x.from && x.until && x.until < x.from;
  if (badRange(draft.season)) return fail(tr('ed.errAvailRange'), 1);
  if (pp.mode !== 'none' && badRange(pp.season)) return fail(tr('ed.errPlanRange'), 2);
  const normSeason = (x) =>
    !x || x.type === 'all' || (x.type === 'range' && !x.from && !x.until)
      ? { type: 'all' }
      : { type: x.type, from: x.from || '', until: x.until || '' };
  draft.season = normSeason(draft.season);
  draft.from = '';
  draft.until = '';
  if (pp.mode === 'dates' && !(pp.dates || []).length) return fail(tr('ed.errNoDates'), 2);
  draft.planned =
    pp.mode === 'none'
      ? { mode: 'none' }
      : {
          mode: pp.mode,
          days: [...(pp.days || [])].sort(),
          every: +pp.every || 1,
          season: normSeason(pp.season),
          anchor:
            pp.anchor ||
            (pp.season && pp.season.type === 'range' && pp.season.from) ||
            pp.from ||
            todayStr(),
          from: '',
          until: '',
          dates: [...new Set(pp.dates || [])].sort(),
          skip: pp.skip || [],
        };
  const cleanPeriod = (p) =>
    !p || !p.type || p.type === 'all'
      ? undefined
      : p.type === 'yearly'
        ? { type: 'yearly', from: p.from, until: p.until, label: (p.label || '').trim() }
        : {
            type: 'range',
            from: p.from || '',
            until: p.until || '',
            label: (p.label || '').trim(),
          };
  draft.slots = draft.slots
    .filter((s) => (s.kind === 'date' ? s.date : (s.days || []).length))
    .map((s) => {
      if (s.kind === 'date')
        return { kind: 'date', date: s.date, start: s.start || '', end: s.end || '' };
      const o = {
          kind: 'weekly',
          days: [...s.days].sort(),
          start: s.start || '',
          end: s.end || '',
        },
        per = cleanPeriod(s.period);
      if (per) o.period = per;
      return o;
    });
  draft.signupUrl = normUrl(draft.signupUrl);
  draft.website = normUrl(draft.website);
  for (const k of Object.keys(draft.thumbs)) if (!draft.photos.includes(k)) delete draft.thumbs[k];
  draft.updatedAt = Date.now();
  // The address must exist (it puts the activity on the map); offline it is checked later.
  // An address entered before the check existed does not block other edits.
  const geoProblem = await checkDraftAddress();
  const addrUnchanged = (draft.address || '').trim() === draft._addrAtOpen;
  if (geoProblem === 'offline' || (geoProblem && addrUnchanged)) {
    if (draft.geo && draft.geo.q !== (draft.address || '').trim()) draft.geo = null;
    if (geoProblem === 'offline') toast(tr('ed.addressUnchecked'));
  } else if (geoProblem) return fail(geoProblem, 3);
  const memberOf = draft._memberOf || [];
  delete draft._memberOf;
  const act = { ...draft },
    isNew = S.sheet.isNew;
  delete act.blocks;
  delete act.singles;
  delete act.courseRows;
  delete act._addrAtOpen;
  if (!act.geo) delete act.geo;
  delete act._course;
  if (!act.course) delete act.course;
  try {
    await persist(act);
    if (act.access && act.access.membership) {
      // keep tariff links in sync with the membership choice
      for (const p of S.plans) {
        const has = (p.activities || []).includes(act.id),
          want = memberOf.includes(p.id);
        if (has !== want)
          await persistPlan({
            ...p,
            activities: want
              ? [...(p.activities || []), act.id]
              : (p.activities || []).filter((x) => x !== act.id),
          }).catch(() => toast(tr('ed.planUpdateFailed')));
      }
    }
    removed.forEach(dropAsset);
    uploads = new Set();
    removed = new Set();
    closeSheet();
    toast(tr(isNew ? 'ed.activityAdded' : 'ed.changesSaved'));
    openDetail(act.id, null);
  } catch (e) {
    fail(
      e && e.code === 'quota_exceeded'
        ? tr('ed.errQuota')
        : e && e.message === 'local-full'
          ? tr('ed.errLocalFull')
          : tr('ed.errSave'),
    );
  }
}
function cancelEdit() {
  uploads.forEach(dropAsset);
  uploads = new Set();
  removed = new Set();
  draft = null;
  closeSheet();
}
