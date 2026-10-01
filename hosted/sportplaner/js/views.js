// Tag, Kalender and Bibliothek views and the render loop. Loaded in order by index.html; all files share one global scope.
/* ---------- views ---------- */
function setHeader(title, sub) {
  setText($('#title'), title);
  setText($('#subtitle'), sub);
}
const SKELETON = {
  day: `<div class="week"><button class="arrow" data-action="week" data-dir="-1" aria-label="Vorherige Woche">${ICON.left}</button><div class="week-days" id="wk"></div><button class="arrow" data-action="week" data-dir="1" aria-label="Nächste Woche">${ICON.right}</button></div><div class="daybar" id="daybar"></div><section id="d-plan" hidden><div class="sect" id="d-plan-h"></div><div id="d-plan-l"></div></section><section id="d-more" hidden><div class="sect" id="d-more-h"></div><div id="d-more-l"></div></section><div id="d-empty"></div>`,
  cal: `<div class="calbar"><div class="seg calseg" id="calseg"></div><div class="viewseg" id="viewseg"></div></div><div id="agenda" hidden></div><div id="calmonth" class="cal-layout"><div class="card"><div class="cal-head"><button class="arrow" data-action="month" data-dir="-1" aria-label="Vorheriger Monat">${ICON.left}</button><h2 id="caltitle"></h2><button class="arrow" data-action="month" data-dir="1" aria-label="Nächster Monat">${ICON.right}</button></div><div class="cal-grid">${DAYS2.map((d) => `<span class="dow">${d}</span>`).join('')}</div><div class="cal-grid" id="cells"></div></div><div><div class="sect" id="calsect"></div><div id="callist"></div></div></div>`,
  lib: `<div class="lib-layout"><div><div class="lib-tools"><div class="search">${ICON.search}<input id="q" type="search" placeholder="Name, Ort, Sportart oder Anbieter" aria-label="Aktivitäten durchsuchen" autocomplete="off"></div><div id="provfilter"></div><div id="chips"></div></div><div id="liblist"></div></div><aside class="backup lib-side" id="backup" aria-label="Datensicherung"></aside></div>`,
};
const emptyHTML = (icon, title, text, action) =>
  `<div class="empty"><div class="empty-icon">${EMPTY_ICON[icon]}</div><h3>${title}</h3><p>${text}</p>${action || ''}</div>`;
const skeletonTiles = () =>
  `<div class="tiles" aria-hidden="true">${'<div class="sk sk-tile"></div>'.repeat(4)}</div><p class="sr-only" role="status">Wird geladen …</p>`;

/* a tile: photo with the time on top, a caption band below (no scrim over the photo) */
function tileHTML(a, s, ds) {
  const img =
    a.photos && a.photos[0]
      ? `<img src="${esc(thumbSrc(a, a.photos[0]))}" alt="" decoding="async">`
      : `<span class="ph">${esc(initials(a.name))}</span>`;
  const more = s.length > 1 ? ` +${s.length - 1}` : '';
  const time = s.length ? timeLabel(s[0]) + more : 'Eingeplant';
  const isDone = (a.done || []).includes(ds),
    off = isCancelled(a, ds),
    pl = isPlanned(a, ds);
  const sub = [a.category, a.location || a.provider].filter(Boolean).join(' · ');
  const badge = isDone
    ? `<span class="tile-done">${ICON.check}Erledigt</span>`
    : off
      ? '<span class="tile-done tile-off">Ausgefallen</span>'
      : '';
  const toggle =
    isDone || off
      ? ''
      : `<button class="tile-pl${pl ? ' on' : ''}" data-action="plan-day" data-id="${esc(a.id)}" data-date="${ds}" aria-pressed="${pl}" aria-label="${esc(a.name)} ${pl ? 'nicht mehr einplanen' : 'einplanen'}"><span>${pl ? ICON.check : ICON.plus}</span></button>`;
  return `<div class="tilewrap"><button class="tile${isDone ? ' is-done' : ''}" data-action="open" data-id="${esc(a.id)}" data-date="${ds}"><span class="tile-media">${img}<span class="tile-time">${esc(time)}</span>${badge}</span><span class="tile-cap"><span class="tile-name">${esc(a.name)}</span>${sub ? `<span class="tile-sub">${esc(sub)}</span>` : ''}</span></button>${toggle}</div>`;
}
const countLabel = (n) => `${n} ${n === 1 ? 'Aktivität' : 'Aktivitäten'}`;
function updDay() {
  const sel = parse(S.date),
    isToday = S.date === todayStr();
  setHeader(
    fmt(sel, { weekday: 'long' }),
    (isToday ? 'Heute, ' : '') + fmt(sel, { day: '2-digit', month: 'short', year: 'numeric' }),
  );
  const mon = addDays(sel, -wIdx(sel)),
    td = todayStr();
  patchList(
    $('#wk'),
    [...Array(7)].map((_, i) => {
      const d = addDays(mon, i),
        ds = ymd(d);
      const cls = ['wd', ds === S.date && 'sel', ds === td && 'today', onDate(ds).length && 'has']
        .filter(Boolean)
        .join(' ');
      return {
        key: ds,
        html: `<button class="${cls}" data-action="pick" data-date="${ds}" aria-label="${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}"><small>${DAYS2[i]}</small><b>${d.getDate()}</b><i></i></button>`,
      };
    }),
  );
  setHTML(
    $('#daybar'),
    isToday ? '' : '<button class="link" data-action="today">Zurück zu heute</button>',
  );
  // Planned or done first, then everything else that is on offer that day.
  const mine = plannedOn(S.date).slice();
  for (const x of onDate(S.date))
    if ((x.a.done || []).includes(S.date) && !mine.some((m) => m.a.id === x.a.id)) mine.push(x);
  mine.sort((x, y) => byStart(x.s[0] || {}, y.s[0] || {}));
  const rest = onDate(S.date).filter((x) => !mine.some((m) => m.a.id === x.a.id));
  const section = (id, title, list) => {
    $(`#${id}`).hidden = !list.length;
    setHTML($(`#${id}-h`), `<h3>${title}<small>${list.length}</small></h3>`);
    listOrEmpty(
      $(`#${id}-l`),
      'tiles',
      list.map((x) => ({ key: x.a.id, html: tileHTML(x.a, x.s, S.date) })),
      '',
    );
  };
  section('d-plan', 'Eingeplant', mine);
  section('d-more', mine.length ? 'Weitere Angebote' : 'Angebote an diesem Tag', rest);
  let empty = '';
  if (S.loading && !S.acts.length) empty = skeletonTiles();
  else if (!S.acts.length)
    empty = emptyHTML(
      'lib',
      'Deine Bibliothek ist leer',
      'Füge die Sportangebote hinzu, aus denen du wählen kannst, mit Tagen, Uhrzeiten und einem Foto.',
      '<button class="btn primary" data-action="new">Aktivität hinzufügen</button>',
    );
  else if (!mine.length && !rest.length)
    empty = emptyHTML(
      'cal',
      'An diesem Tag nichts los',
      `Keine deiner Aktivitäten ist ${esc(fmt(sel, { weekday: 'long' }).toLowerCase())}s oder an diesem Datum verfügbar.`,
      '<button class="btn" data-action="tab" data-tab="lib">Zur Bibliothek</button>',
    );
  setHTML($('#d-empty'), empty);
}

function rowHTML(a, right, ds) {
  const t =
    a.photos && a.photos[0]
      ? `<img class="thumb" src="${esc(thumbSrc(a, a.photos[0]))}" alt="" decoding="async">`
      : `<span class="thumb">${esc(initials(a.name))}</span>`;
  const sub = [a.category, a.provider, a.location].filter(Boolean).join(', ');
  return `<button class="row" data-action="open" data-id="${esc(a.id)}"${ds ? ` data-date="${ds}"` : ''}>${t}<span class="min"><h4>${esc(a.name)}</h4>${sub ? `<p>${esc(sub)}</p>` : ''}${right.below || ''}</span>${right.side || ''}</button>`;
}
const VIEW_ICONS = {
  month:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  agenda:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="4" width="17" height="6.5" rx="2"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="2"/></svg>',
};
function agendaItemHTML(a, s, ds, pl) {
  const t =
    a.photos && a.photos[0]
      ? `<img class="thumb" src="${esc(thumbSrc(a, a.photos[0]))}" alt="" decoding="async">`
      : `<span class="thumb">${esc(initials(a.name))}</span>`;
  const done = (a.done || []).includes(ds),
    off = isCancelled(a, ds),
    planned = !pl && isPlanned(a, ds);
  const time = s.length ? s.map(timeLabel).join(', ') : 'Jederzeit';
  const place = [a.location, a.provider].filter(Boolean).join(', ');
  const state = done
    ? `<span class="ag-state">${ICON.check}Erledigt</span>`
    : off
      ? '<span class="ag-state off">Ausgefallen</span>'
      : planned
        ? '<span class="ag-state">Geplant</span>'
        : '';
  return `<button class="ag-item${done ? ' done' : ''}" data-action="open" data-id="${esc(a.id)}" data-date="${ds}">${t}<span class="min"><h4>${esc(a.name)}</h4><p>${esc(time)}</p>${place ? `<p>${esc(place)}</p>` : ''}</span>${state}</button>`;
}
function updAgenda() {
  const pl = S.calMode === 'planned',
    base = parse(todayStr()),
    td = todayStr();
  setHeader('Kalender', pl ? 'Nächste geplante Teilnahmen' : 'Nächste verfügbare Angebote');
  const groups = [];
  let lastMonth = '';
  for (let i = 0; i < S.agendaDays; i++) {
    const d = addDays(base, i),
      ds = ymd(d),
      list = pl ? plannedOn(ds) : onDate(ds);
    if (!list.length) continue;
    const mk = fmt(d, { month: 'long', year: 'numeric' });
    const head = mk !== lastMonth && groups.length ? `<p class="ag-head">${esc(mk)}</p>` : '';
    lastMonth = mk;
    const rel =
      i === 0 ? 'Heute' : i === 1 ? 'Morgen' : fmt(d, { weekday: 'short' }).replace('.', '');
    groups.push({
      key: ds + S.calMode,
      html: `<div class="ag-group">${head}<div class="ag-day"><div class="ag-date${ds === td ? ' today' : ''}"><b>${d.getDate()}</b><small>${esc(rel)}</small></div><div class="ag-items">${list.map((x) => agendaItemHTML(x.a, x.s, ds, pl)).join('')}</div></div></div>`,
    });
  }
  const until = fmt(addDays(base, S.agendaDays - 1), { day: 'numeric', month: 'long' });
  const empty = emptyHTML(
    'cal',
    pl ? 'Nichts geplant' : 'Keine Angebote',
    pl
      ? `Bis ${esc(until)} sind keine Teilnahmen geplant. Plane sie beim Bearbeiten einer Aktivität oder in ihrer Detailansicht.`
      : `Bis ${esc(until)} ist keine deiner Aktivitäten verfügbar.`,
  );
  const host = $('#agenda');
  if (!groups.length) {
    setHTML(
      host,
      empty +
        `<button class="btn ag-more" data-action="agenda-more">Weitere 4 Wochen anzeigen</button>`,
    );
    return;
  }
  let list = host.firstElementChild;
  if (!list || !list.classList.contains('ag-list') || host._html) {
    host.innerHTML =
      '<div class="ag-list"></div><button class="btn ag-more" data-action="agenda-more"></button>';
    host._html = null;
    list = host.firstElementChild;
  }
  patchList(list, groups);
  setText(
    host.lastElementChild,
    `Weitere Termine laden (bis ${fmt(addDays(base, S.agendaDays + 27), { day: 'numeric', month: 'short' })})`,
  );
}
function updCal() {
  setHTML(
    $('#viewseg'),
    [
      ['month', 'Monatsansicht'],
      ['agenda', 'Terminliste'],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" class="${S.calView === k ? 'on' : ''}" data-action="calview" data-view="${k}" aria-label="${l}" aria-pressed="${S.calView === k}">${VIEW_ICONS[k]}</button>`,
      )
      .join(''),
  );
  $('#agenda').hidden = S.calView !== 'agenda';
  $('#calmonth').hidden = S.calView === 'agenda';
  if (S.calView === 'agenda') {
    setHTML(
      $('#calseg'),
      [
        ['avail', 'Angebote'],
        ['planned', 'Geplant'],
      ]
        .map(
          ([k, l]) =>
            `<button type="button" class="${S.calMode === k ? 'on' : ''}" data-action="calmode" data-mode="${k}" aria-pressed="${S.calMode === k}">${l}</button>`,
        )
        .join(''),
    );
    return updAgenda();
  }
  const first = S.month;
  setHeader(
    'Kalender',
    S.calMode === 'planned' ? 'Deine geplanten Teilnahmen' : 'Wann welche Angebote stattfinden',
  );
  setText($('#caltitle'), fmt(first, { month: 'long', year: 'numeric' }));
  const start = addDays(first, -wIdx(first)),
    td = todayStr();
  const n = addDays(start, 35).getMonth() !== first.getMonth() ? 35 : 42;
  const pl = S.calMode === 'planned';
  setHTML(
    $('#calseg'),
    [
      ['avail', 'Angebote'],
      ['planned', 'Geplant'],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" class="${S.calMode === k ? 'on' : ''}" data-action="calmode" data-mode="${k}" aria-pressed="${S.calMode === k}">${l}</button>`,
      )
      .join(''),
  );
  patchList(
    $('#cells'),
    [...Array(n)].map((_, i) => {
      const d = addDays(start, i),
        ds = ymd(d),
        list = pl ? plannedOn(ds) : onDate(ds),
        c = list.length;
      const dots = pl
        ? list
            .slice(0, 3)
            .map((x) =>
              (x.a.done || []).includes(ds)
                ? '<i></i>'
                : isCancelled(x.a, ds)
                  ? '<i class="x"></i>'
                  : '<i class="o"></i>',
            )
            .join('')
        : '<i></i>'.repeat(Math.min(c, 3));
      const cls = [
        'cell',
        d.getMonth() !== first.getMonth() && 'out',
        ds === td && 'today',
        ds === S.date && 'sel',
      ]
        .filter(Boolean)
        .join(' ');
      return {
        key: ds + S.calMode,
        html: `<button class="${cls}" data-action="calpick" data-date="${ds}" aria-label="${fmt(d, { day: 'numeric', month: 'long' })}, ${c} ${pl ? 'geplant' : 'Aktivitäten'}"><span class="n">${d.getDate()}</span><span class="dots">${dots}</span></button>`,
      };
    }),
  );
  const items = pl ? plannedOn(S.date) : onDate(S.date);
  setHTML(
    $('#calsect'),
    `<h3>${fmt(parse(S.date), { weekday: 'long', day: 'numeric', month: 'long' })}</h3>${!pl && items.length ? '<button class="link" data-action="tab" data-tab="day">Tag öffnen</button>' : ''}`,
  );
  const side = (x) =>
    pl && (x.a.done || []).includes(S.date)
      ? `<span class="next"><b>Erledigt</b>${esc((x.s[0] && x.s[0].start) || '')}</span>`
      : isCancelled(x.a, S.date)
        ? `<span class="next"><b>Ausgefallen</b>${esc((x.s[0] && x.s[0].start) || '')}</span>`
        : `<span class="next"><b>${esc((x.s[0] && x.s[0].start) || 'Jederzeit')}</b>${x.s[0] && x.s[0].end ? esc('bis ' + x.s[0].end) : ''}</span>`;
  listOrEmpty(
    $('#callist'),
    'list-card',
    items.map((x) => ({ key: x.a.id, html: rowHTML(x.a, { side: side(x) }, S.date) })),
    pl
      ? `<p class="note">Für diesen Tag ist nichts geplant. Teilnahmen planst du beim Bearbeiten einer Aktivität oder in ihrer Detailansicht.</p>`
      : `<p class="note">An diesem Tag ist keine Aktivität verfügbar.</p>`,
  );
}

function updLib() {
  setHeader(
    'Bibliothek',
    S.loading && !S.acts.length ? 'Wird geladen …' : countLabel(S.acts.length),
  );
  const cats = [...new Set(S.acts.map((a) => a.category).filter(Boolean))].sort();
  if (!cats.includes(S.cat)) S.cat = 'Alle';
  const provs = [...new Set(S.acts.map((a) => a.provider).filter(Boolean))].sort((x, y) =>
    x.localeCompare(y, 'de'),
  );
  if (S.prov && !provs.includes(S.prov)) S.prov = '';
  setHTML(
    $('#provfilter'),
    provs.length
      ? `<div class="provrow"><label class="sr-only" for="provsel">Anbieter</label><select id="provsel" class="${S.prov ? 'on' : ''}"><option value="">Alle Anbieter</option>${provs.map((p) => `<option value="${esc(p)}"${p === S.prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>`
      : '',
  );
  setHTML(
    $('#chips'),
    cats.length
      ? `<div class="chips">${['Alle', ...cats].map((c) => `<button class="chipbtn ${c === S.cat ? 'on' : ''}" data-action="cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
      : '',
  );
  const q = S.q.trim().toLowerCase(),
    nm = nextMap();
  const list = S.acts
    .filter(
      (a) =>
        (S.cat === 'Alle' || a.category === S.cat) &&
        (!S.prov || a.provider === S.prov) &&
        (!q ||
          [a.name, a.category, a.provider, a.location, a.description]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    )
    .sort((x, y) => x.name.localeCompare(y.name, 'de'));
  const items = list.map((a) => {
    const days = new Set();
    let dates = 0;
    for (const s of a.slots || []) {
      if (s.kind === 'date') dates++;
      else for (const d of s.days || []) days.add(d);
    }
    const pills = `<span class="pills">${days.size ? DAYS2.map((d, i) => `<span class="${days.has(i) ? 'on' : ''}">${d}</span>`).join('') : ''}${dates ? `<em>${days.size ? '&ensp;+' : ''}${dates} ${dates > 1 ? 'Termine' : 'Termin'}</em>` : ''}${!days.size && !dates ? '<em>Keine Zeiten angegeben</em>' : ''}</span>`;
    const nx = nm.get(a.id);
    const when = !nx
      ? ''
      : nx.i === 0
        ? 'Heute'
        : nx.i === 1
          ? 'Morgen'
          : nx.i < 7
            ? DAYS[wIdx(parse(nx.ds))]
            : fmt(parse(nx.ds), { day: 'numeric', month: 'short' });
    return {
      key: a.id,
      html: rowHTML(a, {
        below: pills,
        side: nx ? `<span class="next"><b>${esc(when)}</b>${esc(nx.s.start || '')}</span>` : '',
      }),
    };
  });
  listOrEmpty(
    $('#liblist'),
    'list-card',
    items,
    S.acts.length
      ? emptyHTML(
          'search',
          'Nichts gefunden',
          'Keine Aktivität passt zu deiner Suche oder deinen Filtern.',
        )
      : S.loading
        ? '<div class="sk sk-list"></div>'
        : emptyHTML(
            'lib',
            'Noch keine Aktivitäten',
            'Alles, was du hinzufügst, erscheint hier, zusammen mit den verfügbaren Zeiten.',
            '<button class="btn primary" data-action="new">Aktivität hinzufügen</button>',
          ),
  );
  updBackup();
}

let mounted = null,
  rq = 0;
const UPD = { day: updDay, cal: updCal, lib: updLib };
function render() {
  if (rq) {
    cancelAnimationFrame(rq);
    rq = 0;
  }
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('on', t.dataset.tab === S.view);
  });
  const addLabel = S.view === 'stats' ? 'Tarif hinzufügen' : 'Aktivität hinzufügen';
  $('.top .add').setAttribute('aria-label', addLabel);
  setText($('.side-add-label'), addLabel);
  if (S.view !== 'stats') setHTML($('#tools'), '');
  if (mounted !== S.view) {
    $('#view').innerHTML = SKELETON[S.view];
    mounted = S.view;
    if (S.view === 'lib') $('#q').value = S.q;
  }
  UPD[S.view]();
  if (S.sheet && S.sheet.type === 'detail') updDetail();
}
function scheduleRender() {
  if (!rq)
    rq = requestAnimationFrame(() => {
      rq = 0;
      render();
    });
}
