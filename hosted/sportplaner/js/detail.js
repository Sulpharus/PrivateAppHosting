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
    (x) => !x.disabled && x.getClientRects().length,
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
  return `<div class="gallery">${photos.map((p, i) => `<img src="${esc(photoSrc(p))}" alt="" decoding="async"${i ? ' loading="lazy"' : ''}>`).join('')}</div>${photos.length > 1 ? `<div class="gcount">${photos.length} Fotos, zum Blättern wischen</div>` : ''}`;
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
      today = `<div class="today-box${off ? ' is-off' : ''}"><span><small>${fmt(parse(ds), { weekday: 'long', day: 'numeric', month: 'long' })}</small><b>${esc(off ? 'Ausgefallen' : s.length ? s.map(timeLabel).join(', ') : 'Geplant')}</b>${!off && cp && cp.per.has(ds) ? `<small>${eur(cp.per.get(ds))} für diesen Termin</small>` : ''}</span><span class="tb-actions">${off ? '' : `<button class="done-btn ${planned ? 'on' : ''}" data-action="plan-toggle" aria-pressed="${planned}">${planned ? ICON.check : ''}Eingeplant</button><button class="done-btn ${on ? 'on' : ''}" data-action="toggle-done" aria-pressed="${on}">${on ? ICON.check + 'Erledigt' : 'Erledigt'}</button>`}<button class="done-btn ${off ? 'on' : ''}" data-action="toggle-cancel" aria-pressed="${off}">${off ? ICON.check + 'Ausgefallen' : 'Ausgefallen'}</button></span>${off ? '<small class="tb-note">Nicht stattgefunden. Zählt weder als Teilnahme noch als verpasst.</small>' : ''}</div>`;
    }
  }
  const facts = [];
  const slots = a.slots || [];
  let when = slots.length ? groupedWhen(slots) : '<p class="muted">Keine Zeiten angegeben</p>';
  const aSeason = seasonOf(a);
  if (aSeason && aSeason.type !== 'all')
    when += `<p class="muted">Angebot ${esc(periodLabel(aSeason))}</p>`;
  facts.push(['Wann', when]);
  if (hasPlan(a)) {
    const nx = [];
    const base = parse(todayStr());
    for (let i = 0; i < 120 && nx.length < 3; i++) {
      const d = ymd(addDays(base, i));
      if (isPlanned(a, d) && !(a.done || []).includes(d) && !isCancelled(a, d)) nx.push(d);
    }
    facts.push([
      'Geplant',
      `<p>${esc(plannedSummary(a))}</p>${nx.length ? `<span class="pnext">Nächste: ${esc(nx.map((d) => fmt(parse(d), { weekday: 'short', day: 'numeric', month: 'short' })).join(', '))}</span>` : '<span class="pnext">Keine anstehenden Termine</span>'}`,
    ]);
  }
  const acc = a.access || {},
    memberPlans = S.plans.filter(
      (p) => (p.activities || []).includes(a.id) && (p.type === 'recurring' || p.type === 'once'),
    );
  if (acc.guest || acc.students || acc.membership)
    facts.push([
      'Zugang',
      `<div class="acc-tags">${acc.guest ? '<span class="tag">Gastzutritt möglich</span>' : ''}${acc.students ? '<span class="tag">Für Studenten</span>' : ''}${acc.membership ? '<span class="tag">Mitgliedschaft erforderlich</span>' : ''}</div>${acc.membership && memberPlans.length ? `<p class="muted">Zählt zu: ${esc(memberPlans.map((p) => p.name).join(', '))}</p>` : ''}`,
    ]);
  if (a.provider)
    facts.push([
      'Anbieter',
      `<p>${esc(a.provider)}</p>${S.acts.filter((x) => x.provider === a.provider).length > 1 ? `<p><button class="link" style="padding:4px 0" data-action="filter-prov" data-prov="${esc(a.provider)}">Alle Angebote anzeigen</button></p>` : ''}`,
    ]);
  if (a.location || a.address) {
    const q = encodeURIComponent([a.location, a.address].filter(Boolean).join(', '));
    facts.push([
      'Wo',
      `${a.location ? `<p>${esc(a.location)}</p>` : ''}${a.address ? `<p class="muted">${esc(a.address)}</p>` : ''}<p>${geoFits(a) ? `<button type="button" class="link" data-action="map-show" data-id="${esc(a.id)}">Auf der Karte zeigen</button> · ` : ''}<a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">In Google Maps öffnen</a></p>`,
    ]);
  }
  if (a.equipment && a.equipment.length)
    facts.push([
      'Mitbringen',
      a.equipment.map((e) => `<span class="tag">${esc(e)}</span>`).join(''),
    ]);
  if ((a.signup && a.signup !== 'none') || a.signupUrl || a.signupNotes) {
    facts.push([
      'Anmeldung',
      `<p>${esc(SIGNUP[a.signup] || 'Nicht nötig')}</p>${a.signupNotes ? `<p class="muted">${esc(a.signupNotes)}</p>` : ''}${a.signupUrl ? `<p><a href="${esc(safeUrl(a.signupUrl))}" target="_blank" rel="noopener">Anmeldeseite öffnen</a></p>` : ''}`,
    ]);
  } else facts.push(['Anmeldung', '<p>Nicht nötig</p>']);
  const costLines = [
    cp &&
      `<p>Kurs: ${eur(cp.price)} ${cp.type === 'month' ? 'pro Monat' : 'für den ganzen Kurs'}${cp.avg !== null ? `, im Schnitt <b>${eur(cp.avg)} pro Termin</b>` : ''}</p><p class="muted">${cp.sessions} ${cp.sessions === 1 ? 'Termin' : 'Termine'}${cp.type === 'month' ? `, ${eur(cp.total)} für ${cp.months} ${cp.months === 1 ? 'Monat' : 'Monate'}` : ''}${cp.cancelled ? `; ${cp.cancelled} ausgefallene nicht mitgerechnet` : ''}${tariffed ? '. Ein Tarif ist verknüpft: die Statistik zählt nur den Tarif.' : ''}</p>`,
    a.cost && `<p>${esc(a.cost)}</p>`,
    +a.visitPrice > 0 &&
      `<p>${eur(+a.visitPrice)} pro Besuch${cp ? ' <span class="muted">(zählt neben dem Kurspreis nicht)</span>' : ''}</p>`,
    ...S.plans
      .filter((p) => (p.activities || []).includes(a.id))
      .map((p) => `<p>${esc(p.name)} <span class="muted">${esc(planSummary(p))}</span></p>`),
  ].filter(Boolean);
  if (costLines.length) facts.push(['Kosten', costLines.join('')]);
  if (a.level) facts.push(['Niveau', `<p>${esc(levelLabel(a.level))}</p>`]);
  if (a.contact) facts.push(['Kontakt', `<p>${esc(a.contact)}</p>`]);
  if (a.website)
    facts.push([
      'Webseite',
      `<p><a href="${esc(safeUrl(a.website))}" target="_blank" rel="noopener">${esc(a.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a></p>`,
    ]);
  if (a.notes) facts.push(['Notizen', `<p style="white-space:pre-line">${esc(a.notes)}</p>`]);
  const done = [...(a.done || [])].sort(),
    yr = String(new Date().getFullYear()),
    td = todayStr();
  const yrN = done.filter((d) => d.startsWith(yr)).length,
    offN = (a.cancelled || []).length;
  facts.push([
    'Besuche',
    (done.length
      ? `<p>${done.length}-mal erledigt, davon ${yrN} in ${yr}</p><div class="visits">${done
          .slice(-6)
          .reverse()
          .map(
            (d) =>
              `<span class="tag">${fmt(parse(d), { day: 'numeric', month: 'short', year: '2-digit' })}<button class="vx" data-action="del-visit" data-d="${esc(d)}" aria-label="Besuch am ${fmt(parse(d), { day: 'numeric', month: 'long' })} entfernen">×</button></span>`,
          )
          .join('')}</div>`
      : '<p class="muted">Noch keine Besuche eingetragen</p>') +
      (offN
        ? `<p class="muted">${offN} ${offN === 1 ? 'Termin' : 'Termine'} ausgefallen, zählen nicht mit</p>`
        : '') +
      `<div class="visit-add"><input type="date" id="visitdate" value="${td}" max="${td}" aria-label="Datum des Besuchs"><button class="btn" data-action="add-visit">Eintragen</button></div>`,
  ]);
  const chips = [
    a.category && `<span class="chip">${esc(a.category)}</span>`,
    a.level && `<span class="chip plain">${esc(levelLabel(a.level))}</span>`,
  ].filter(Boolean);
  return `<h2 class="d-title" id="sheet-title">${esc(a.name)}</h2>${chips.length ? `<p class="d-meta">${chips.join('')}</p>` : ''}
    ${a.description ? `<p class="d-desc">${esc(a.description)}</p>` : ''}${today}
    <dl class="facts">${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="d-actions"><button class="btn danger" data-action="del">Aktivität löschen</button></div>`;
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
    `<div class="bar float"><button class="icon" data-action="close" aria-label="Schließen">${ICON.close}</button><button class="btn" data-action="edit">Bearbeiten</button></div><div id="d-gal"></div><div class="d-body" id="d-body"></div>`,
  );
  updDetail();
}
