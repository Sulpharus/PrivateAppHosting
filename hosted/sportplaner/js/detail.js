// Sheets (dialogs) and the activity detail. Loaded in order by index.html; all files share one global scope.
/* ---------- sheets ---------- */
let sheetReturn = null;
function openSheet(html, tall) {
  if (!$('#sheet-root').firstChild) sheetReturn = document.activeElement;
  $('#sheet-root').innerHTML =
    `<div class="overlay" data-action="backdrop"><div class="sheet${tall ? ' tall' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">${html}</div></div>`;
  document.body.style.overflow = 'hidden';
  $('.sheet').focus({ preventScroll: true });
}
function closeSheet() {
  S.sheet = null;
  $('#sheet-root').innerHTML = '';
  document.body.style.overflow = '';
  if (sheetReturn && sheetReturn.isConnected) sheetReturn.focus({ preventScroll: true });
  sheetReturn = null;
}
// Keep Tab inside the open sheet.
document.addEventListener('keydown', (e) => {
  const sheet = e.key === 'Tab' && S.sheet && $('.sheet');
  if (!sheet) return;
  const f = [...sheet.querySelectorAll('button,input,select,textarea,a[href]')].filter(
    // tabindex=-1: the hidden inputs behind the kit's date fields are not Tab stops
    (x) => !x.disabled && x.tabIndex !== -1 && x.getClientRects().length,
  );
  if (!f.length) return;
  const first = f[0],
    last = f[f.length - 1],
    cur = document.activeElement;
  if (e.shiftKey && (cur === first || cur === sheet)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && cur === last) {
    e.preventDefault();
    first.focus();
  }
});
// Forms are saved through their buttons; Enter must not reload the page.
document.addEventListener('submit', (e) => e.preventDefault());

function galleryHTML(a) {
  const photos = a.photos || [];
  if (!photos.length) return '';
  return `<div class="gallery">${photos.map((p, i) => `<img src="${esc(photoSrc(p))}" alt="" decoding="async"${i ? ' loading="lazy"' : ''}>`).join('')}</div>${photos.length > 1 ? `<div class="gcount">${esc(tr('detail.photos', { n: photos.length }))}</div>` : ''}`;
}
function detailBodyHTML(a, ds) {
  let today = '';
  const cp = coursePrices(a),
    tariffed = S.plans.some((p) => (p.activities || []).includes(a.id));
  if (ds) {
    const s = slotsOn(a, ds),
      planned = isPlanned(a, ds);
    if (s.length || planned) {
      const on = (a.done || []).includes(ds),
        off = isCancelled(a, ds);
      today = `<div class="today-box${off ? ' is-off' : ''}"><span><small>${fmt(parse(ds), { weekday: 'long', day: 'numeric', month: 'long' })}</small><b>${esc(off ? tr('detail.cancelled') : s.length ? s.map(timeLabel).join(', ') : tr('fact.planned'))}</b>${!off && cp && cp.per.has(ds) ? `<small>${esc(tr('detail.sessionCost', { price: eur(cp.per.get(ds)) }))}</small>` : ''}</span><span class="tb-actions">${off ? '' : `<button class="done-btn ${planned ? 'on' : ''}" data-action="plan-toggle" aria-pressed="${planned}">${planned ? ICON.check : ''}${esc(tr('detail.planned'))}</button><button class="done-btn ${on ? 'on' : ''}" data-action="toggle-done" aria-pressed="${on}">${on ? ICON.check : ''}${esc(tr('detail.done'))}</button>`}<button class="done-btn ${off ? 'on' : ''}" data-action="toggle-cancel" aria-pressed="${off}">${off ? ICON.check : ''}${esc(tr('detail.cancelled'))}</button></span>${off ? `<small class="tb-note">${esc(tr('detail.cancelledNote'))}</small>` : ''}</div>`;
    }
  }
  const facts = [];
  const slots = a.slots || [];
  let when = slots.length
    ? groupedWhen(slots)
    : `<p class="muted">${esc(tr('detail.noTimes'))}</p>`;
  const aSeason = seasonOf(a);
  if (aSeason && aSeason.type !== 'all')
    when += `<p class="muted">${esc(tr('detail.offerPeriod', { period: periodLabel(aSeason) }))}</p>`;
  facts.push([tr('fact.when'), when]);
  if (hasPlan(a)) {
    const nx = [];
    const base = parse(todayStr());
    for (let i = 0; i < 120 && nx.length < 3; i++) {
      const d = ymd(addDays(base, i));
      if (isPlanned(a, d) && !(a.done || []).includes(d) && !isCancelled(a, d)) nx.push(d);
    }
    facts.push([
      tr('fact.planned'),
      `<p>${esc(plannedSummary(a))}</p>${nx.length ? `<span class="pnext">${esc(tr('detail.next', { dates: nx.map((d) => fmt(parse(d), { weekday: 'short', day: 'numeric', month: 'short' })).join(', ') }))}</span>` : `<span class="pnext">${esc(tr('detail.noUpcoming'))}</span>`}`,
    ]);
  }
  const acc = a.access || {},
    memberPlans = S.plans.filter(
      (p) => (p.activities || []).includes(a.id) && (p.type === 'recurring' || p.type === 'once'),
    );
  if (acc.guest || acc.students || acc.membership)
    facts.push([
      tr('fact.access'),
      `<div class="acc-tags">${acc.guest ? `<span class="tag">${esc(tr('detail.guest'))}</span>` : ''}${acc.students ? `<span class="tag">${esc(tr('detail.students'))}</span>` : ''}${acc.membership ? `<span class="tag">${esc(tr('detail.membership'))}</span>` : ''}</div>${acc.membership && memberPlans.length ? `<p class="muted">${esc(tr('detail.countsTo', { plans: memberPlans.map((p) => p.name).join(', ') }))}</p>` : ''}`,
    ]);
  if (a.provider)
    facts.push([
      tr('fact.provider'),
      `<p>${esc(a.provider)}</p>${S.acts.filter((x) => x.provider === a.provider).length > 1 ? `<p><button class="link" style="padding:4px 0" data-action="filter-prov" data-prov="${esc(a.provider)}">${esc(tr('detail.allOffers'))}</button></p>` : ''}`,
    ]);
  if (a.location || a.address) {
    const q = encodeURIComponent([a.location, a.address].filter(Boolean).join(', '));
    facts.push([
      tr('fact.where'),
      `${a.location ? `<p>${esc(a.location)}</p>` : ''}${a.address ? `<p class="muted">${esc(a.address)}</p>` : ''}<p>${geoFits(a) ? `<button type="button" class="link" data-action="map-show" data-id="${esc(a.id)}">${esc(tr('detail.showOnMap'))}</button> · ` : ''}<a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${esc(tr('detail.openMaps'))}</a></p>`,
    ]);
  }
  if (a.equipment && a.equipment.length)
    facts.push([
      tr('fact.bring'),
      a.equipment.map((e) => `<span class="tag">${esc(e)}</span>`).join(''),
    ]);
  if ((a.signup && a.signup !== 'none') || a.signupUrl || a.signupNotes) {
    facts.push([
      tr('fact.signup'),
      `<p>${esc(tr(SIGNUP[a.signup] || SIGNUP.none))}</p>${a.signupNotes ? `<p class="muted">${esc(a.signupNotes)}</p>` : ''}${a.signupUrl ? `<p><a href="${esc(safeUrl(a.signupUrl))}" target="_blank" rel="noopener">${esc(tr('detail.signupOpen'))}</a></p>` : ''}`,
    ]);
  } else facts.push([tr('fact.signup'), `<p>${esc(tr(SIGNUP.none))}</p>`]);
  const costLines = [
    cp &&
      `<p>${esc(tr('detail.courseLine', { price: eur(cp.price), basis: tr(cp.type === 'month' ? 'detail.courseMonth' : 'detail.courseWhole') }))}${cp.avg !== null ? `, <b>${esc(tr('detail.courseAvg', { price: eur(cp.avg) }))}</b>` : ''}</p><p class="muted">${esc(tr('detail.courseSessions', { n: cp.sessions }))}${cp.type === 'month' ? esc(tr('detail.courseMonths', { n: cp.months, total: eur(cp.total) })) : ''}${cp.cancelled ? esc(tr('detail.courseCancelled', { n: cp.cancelled })) : ''}${tariffed ? esc(tr('detail.courseTariff')) : ''}</p>`,
    a.cost && `<p>${esc(a.cost)}</p>`,
    +a.visitPrice > 0 &&
      `<p>${esc(tr('detail.perVisit', { price: eur(+a.visitPrice) }))}${cp ? ` <span class="muted">${esc(tr('detail.notCounted'))}</span>` : ''}</p>`,
    ...S.plans
      .filter((p) => (p.activities || []).includes(a.id))
      .map(
        (p) =>
          `<p>${esc(p.name)} <span class="muted">${esc(planSummary(p))}</span>${quotaActivityLines(
            p,
            a,
            todayStr(),
          )
            .map((line) => `<br><span class="quota-use">${esc(line)}</span>`)
            .join('')}</p>`,
      ),
  ].filter(Boolean);
  if (costLines.length) facts.push([tr('fact.cost'), costLines.join('')]);
  if (a.level) facts.push([tr('fact.level'), `<p>${esc(levelLabel(a.level))}</p>`]);
  if (a.contact) facts.push([tr('fact.contact'), `<p>${esc(a.contact)}</p>`]);
  if (a.website)
    facts.push([
      tr('fact.website'),
      `<p><a href="${esc(safeUrl(a.website))}" target="_blank" rel="noopener">${esc(a.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></p>`,
    ]);
  if (a.notes)
    facts.push([tr('fact.notes'), `<p style="white-space:pre-line">${esc(a.notes)}</p>`]);
  const done = [...(a.done || [])].sort(),
    yr = String(new Date().getFullYear()),
    td = todayStr();
  const yrN = done.filter((d) => d.startsWith(yr)).length,
    offN = (a.cancelled || []).length;
  facts.push([
    tr('fact.visits'),
    (done.length
      ? `<p>${esc(tr('detail.visitsDone', { n: done.length, year: yrN, yr }))}</p><div class="visits">${done
          .slice(-6)
          .reverse()
          .map(
            (d) =>
              `<span class="tag">${fmt(parse(d), { day: '2-digit', month: 'short', year: 'numeric' })}<button class="vx" data-action="del-visit" data-d="${esc(d)}" aria-label="${esc(tr('detail.removeVisit', { date: fmt(parse(d), { day: 'numeric', month: 'long' }) }))}">×</button></span>`,
          )
          .join('')}</div>`
      : `<p class="muted">${esc(tr('detail.noVisits'))}</p>`) +
      (offN ? `<p class="muted">${esc(tr('detail.offCount', { n: offN }))}</p>` : '') +
      `<div class="visit-add"><input type="date" id="visitdate" value="${td}" max="${td}" aria-label="${esc(tr('detail.visitDate'))}"><button class="btn" data-action="add-visit">${esc(tr('detail.enter'))}</button></div>`,
  ]);
  const chips = [
    ...sportsOf(a.category).map((sport) => `<span class="chip">${esc(sport)}</span>`),
    a.level && `<span class="chip plain">${esc(levelLabel(a.level))}</span>`,
  ].filter(Boolean);
  return `<h2 class="d-title" id="sheet-title">${esc(a.name)}</h2>${chips.length ? `<p class="d-meta">${chips.join('')}</p>` : ''}
    ${a.description ? `<p class="d-desc">${esc(a.description)}</p>` : ''}${today}
    <dl class="facts">${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="d-actions"><button class="btn danger" data-action="del">${esc(tr('detail.delete'))}</button></div>`;
}
function updDetail() {
  const a = S.acts.find((x) => x.id === S.sheet.id);
  if (!a) return closeSheet();
  setHTML($('#d-gal'), galleryHTML(a) || '<div class="d-hero empty-hero"></div>');
  if (delArmed !== a.id) {
    // keep keyboard focus on the same control when the body is rebuilt
    const act =
      document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.action
        : null;
    setHTML($('#d-body'), detailBodyHTML(a, S.sheet.date));
    if (act && (!document.activeElement || document.activeElement === document.body))
      ($(`#d-body [data-action="${act}"]`) || $('#d-body [data-action=toggle-cancel]'))?.focus();
  }
}
function openDetail(id, ds) {
  if (!S.acts.some((x) => x.id === id)) return;
  S.sheet = { type: 'detail', id, date: ds || null };
  openSheet(
    `<div class="bar float"><button class="icon" data-action="close" aria-label="${esc(tr('action.close'))}">${ICON.close}</button><button class="btn" data-action="edit">${esc(tr('action.edit'))}</button></div><div id="d-gal"></div><div class="d-body" id="d-body"></div>`,
  );
  updDetail();
}
