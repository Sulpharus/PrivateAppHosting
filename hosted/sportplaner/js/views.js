// Tag, Kalender and Bibliothek views and the render loop. Loaded in order by index.html; all files share one global scope.
/* ---------- views ---------- */
function setHeader(title, sub) {
  setText($('#title'), title);
  setText($('#subtitle'), sub);
}
// Functions: the texts follow the language, so a skeleton is built when its view is mounted.
// The files of later views (stats.js, map.js) add theirs to SKELETON_EXTRA.
const SKELETON_EXTRA = [];
const baseSkeleton = () => ({
  day: `<div class="week"><button class="arrow" data-action="week" data-dir="-1" aria-label="${esc(tr('week.prev'))}">${ICON.left}</button><div class="week-days" id="wk"></div><button class="arrow" data-action="week" data-dir="1" aria-label="${esc(tr('week.next'))}">${ICON.right}</button></div><div class="daybar" id="daybar"></div><section id="d-plan" hidden><div class="sect" id="d-plan-h"></div><div id="d-plan-l"></div></section><section id="d-more" hidden><div class="sect" id="d-more-h"></div><div id="d-more-l"></div></section><div id="d-empty"></div>`,
  cal: `<div class="calbar"><div class="seg calseg" id="calseg"></div><div class="viewseg" id="viewseg"></div></div><div id="agenda" hidden></div><div id="calmonth" class="cal-layout"><div class="card"><div class="cal-head"><button class="arrow" data-action="month" data-dir="-1" aria-label="${esc(tr('month.prev'))}">${ICON.left}</button><h2 id="caltitle"></h2><button class="arrow" data-action="month" data-dir="1" aria-label="${esc(tr('month.next'))}">${ICON.right}</button></div><div class="cal-grid">${DAYS()
    .map((d) => `<span class="dow">${d}</span>`)
    .join(
      '',
    )}</div><div class="cal-grid" id="cells"></div></div><div><div class="sect" id="calsect"></div><div id="callist"></div></div></div>`,
  lib: `<div class="lib-layout"><div><div class="lib-tools"><div class="search">${ICON.search}<input id="q" type="search" placeholder="${esc(tr('lib.searchPlaceholder'))}" aria-label="${esc(tr('lib.searchLabel'))}" autocomplete="off"></div><div id="provfilter"></div><div id="chips"></div></div><div id="liblist"></div></div><aside class="backup lib-side" id="backup" aria-label="${esc(tr('backup.region'))}"></aside></div>`,
});
const SKELETON = () => Object.assign(baseSkeleton(), ...SKELETON_EXTRA.map((f) => f()));
const emptyHTML = (icon, title, text, action) =>
  `<div class="empty"><div class="empty-icon">${EMPTY_ICON[icon]}</div><h3>${title}</h3><p>${text}</p>${action || ''}</div>`;
const skeletonTiles = () =>
  `<div class="tiles" aria-hidden="true">${'<div class="sk sk-tile"></div>'.repeat(4)}</div><p class="sr-only" role="status">${esc(tr('common.loading'))}</p>`;

/* a tile: photo with the time on top, a caption band below (no scrim over the photo) */
function tileHTML(a, s, ds) {
  const img =
    a.photos && a.photos[0]
      ? `<img src="${esc(thumbSrc(a, a.photos[0]))}" alt="" decoding="async">`
      : `<span class="ph">${esc(initials(a.name))}</span>`;
  const more = s.length > 1 ? ` +${s.length - 1}` : '';
  const time = s.length ? timeLabel(s[0]) + more : tr('tile.planned');
  const isDone = (a.done || []).includes(ds),
    off = isCancelled(a, ds),
    pl = isPlanned(a, ds);
  const sub = [a.category, a.location || a.provider].filter(Boolean).join(' · ');
  const badge = isDone
    ? `<span class="tile-done">${ICON.check}${esc(tr('tile.done'))}</span>`
    : off
      ? `<span class="tile-done tile-off">${esc(tr('tile.cancelled'))}</span>`
      : '';
  const toggle =
    isDone || off
      ? ''
      : `<button class="tile-pl${pl ? ' on' : ''}" data-action="plan-day" data-id="${esc(a.id)}" data-date="${ds}" aria-pressed="${pl}" aria-label="${esc(tr(pl ? 'tile.unplan' : 'tile.plan', { name: a.name }))}"><span>${pl ? ICON.check : ICON.plus}</span></button>`;
  return `<div class="tilewrap"><button class="tile${isDone ? ' is-done' : ''}" data-action="open" data-id="${esc(a.id)}" data-date="${ds}"><span class="tile-media">${img}<span class="tile-time">${esc(time)}</span>${badge}</span><span class="tile-cap"><span class="tile-name">${esc(a.name)}</span>${sub ? `<span class="tile-sub">${esc(sub)}</span>` : ''}</span></button>${toggle}</div>`;
}
const countLabel = (n) => tr('lib.count', { n });
function updDay() {
  const sel = parse(S.date),
    isToday = S.date === todayStr();
  setHeader(
    fmt(sel, { weekday: 'long' }),
    isToday
      ? tr('day.todayPrefix', {
          date: fmt(sel, { day: '2-digit', month: 'short', year: 'numeric' }),
        })
      : fmt(sel, { day: '2-digit', month: 'short', year: 'numeric' }),
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
        html: `<button class="${cls}" data-action="pick" data-date="${ds}" aria-label="${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}"><small>${dayShort(i)}</small><b>${d.getDate()}</b><i></i></button>`,
      };
    }),
  );
  setHTML(
    $('#daybar'),
    isToday
      ? ''
      : `<button class="link" data-action="today">${esc(tr('day.backToToday'))}</button>`,
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
  section('d-plan', esc(tr('day.sectionPlanned')), mine);
  section('d-more', esc(tr(mine.length ? 'day.sectionMore' : 'day.sectionOffers')), rest);
  let empty = '';
  if (S.loading && !S.acts.length) empty = skeletonTiles();
  else if (!S.acts.length)
    empty = emptyHTML(
      'lib',
      esc(tr('empty.libTitle')),
      esc(tr('empty.libText')),
      `<button class="btn primary" data-action="new">${esc(tr('action.addActivity'))}</button>`,
    );
  else if (!mine.length && !rest.length)
    empty = emptyHTML(
      'cal',
      esc(tr('day.nothingTitle')),
      esc(tr('day.nothingText', { weekday: fmt(sel, { weekday: 'long' }) })),
      `<button class="btn" data-action="tab" data-tab="lib">${esc(tr('action.toLibrary'))}</button>`,
    );
  setHTML($('#d-empty'), empty);
}

function rowHTML(a, right, ds) {
  const t =
    a.photos && a.photos[0]
      ? `<img class="thumb" src="${esc(thumbSrc(a, a.photos[0]))}" alt="" decoding="async">`
      : `<span class="thumb">${esc(initials(a.name))}</span>`;
  const sub = [a.category, a.provider, a.location].filter(Boolean).join(', ');
  return `<button class="row${right.off ? ' off' : ''}" data-action="open" data-id="${esc(a.id)}"${ds ? ` data-date="${ds}"` : ''}>${t}<span class="min"><h4>${esc(a.name)}</h4>${sub ? `<p>${esc(sub)}</p>` : ''}${right.below || ''}</span>${right.side || ''}</button>`;
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
  const time = s.length ? s.map(timeLabel).join(', ') : tr('time.anytime');
  const place = [a.location, a.provider].filter(Boolean).join(', ');
  const state = done
    ? `<span class="ag-state">${ICON.check}${esc(tr('agenda.stateDone'))}</span>`
    : off
      ? `<span class="ag-state off">${esc(tr('tile.cancelled'))}</span>`
      : planned
        ? `<span class="ag-state">${esc(tr('agenda.statePlanned'))}</span>`
        : '';
  return `<button class="ag-item${done ? ' done' : ''}" data-action="open" data-id="${esc(a.id)}" data-date="${ds}">${t}<span class="min"><h4>${esc(a.name)}</h4><p>${esc(time)}</p>${place ? `<p>${esc(place)}</p>` : ''}</span>${state}</button>`;
}
function updAgenda() {
  const pl = S.calMode === 'planned',
    base = parse(todayStr()),
    td = todayStr();
  setHeader(tr('cal.title'), tr(pl ? 'cal.subPlannedNext' : 'cal.subAvailNext'));
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
      i === 0
        ? tr('agenda.today')
        : i === 1
          ? tr('agenda.tomorrow')
          : fmt(d, { weekday: 'short' }).replace('.', '');
    groups.push({
      key: ds + S.calMode,
      html: `<div class="ag-group">${head}<div class="ag-day"><div class="ag-date${ds === td ? ' today' : ''}"><b>${d.getDate()}</b><small>${esc(rel)}</small></div><div class="ag-items">${list.map((x) => agendaItemHTML(x.a, x.s, ds, pl)).join('')}</div></div></div>`,
    });
  }
  const until = fmt(addDays(base, S.agendaDays - 1), { day: 'numeric', month: 'long' });
  const empty = emptyHTML(
    'cal',
    esc(tr(pl ? 'cal.nothingPlanned' : 'cal.noOffers')),
    esc(tr(pl ? 'cal.nothingPlannedText' : 'cal.noOffersText', { until })),
  );
  const host = $('#agenda');
  if (!groups.length) {
    setHTML(
      host,
      empty +
        `<button class="btn ag-more" data-action="agenda-more">${esc(tr('cal.moreFour'))}</button>`,
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
    tr('cal.loadMore', {
      until: fmt(addDays(base, S.agendaDays + 27), { day: 'numeric', month: 'short' }),
    }),
  );
}
function updCal() {
  setHTML(
    $('#viewseg'),
    [
      ['month', tr('cal.viewMonth')],
      ['agenda', tr('cal.viewAgenda')],
    ]
      .map(
        ([k, l]) =>
          `<button type="button" class="${S.calView === k ? 'on' : ''}" data-action="calview" data-view="${k}" aria-label="${esc(l)}" aria-pressed="${S.calView === k}">${VIEW_ICONS[k]}</button>`,
      )
      .join(''),
  );
  $('#agenda').hidden = S.calView !== 'agenda';
  $('#calmonth').hidden = S.calView === 'agenda';
  if (S.calView === 'agenda') {
    setHTML(
      $('#calseg'),
      [
        ['avail', tr('cal.modeAvail')],
        ['planned', tr('cal.modePlanned')],
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
    tr('cal.title'),
    tr(S.calMode === 'planned' ? 'cal.subPlannedMonth' : 'cal.subAvailMonth'),
  );
  setText($('#caltitle'), fmt(first, { month: 'long', year: 'numeric' }));
  const start = addDays(first, -wIdx(first)),
    td = todayStr();
  const n = addDays(start, 35).getMonth() !== first.getMonth() ? 35 : 42;
  const pl = S.calMode === 'planned';
  setHTML(
    $('#calseg'),
    [
      ['avail', tr('cal.modeAvail')],
      ['planned', tr('cal.modePlanned')],
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
      // A cancelled session is a red dot in both modes; done and planned keep their own marks.
      const offN = list.filter((x) => isCancelled(x.a, ds)).length;
      const dots = list
        .slice(0, 3)
        .map((x) =>
          isCancelled(x.a, ds)
            ? '<i class="off"></i>'
            : pl
              ? (x.a.done || []).includes(ds)
                ? '<i></i>'
                : '<i class="o"></i>'
              : '<i></i>',
        )
        .join('');
      const cls = [
        'cell',
        d.getMonth() !== first.getMonth() && 'out',
        ds === td && 'today',
        ds === S.date && 'sel',
        c > 0 && offN === c && 'off',
      ]
        .filter(Boolean)
        .join(' ');
      const label = tr(pl ? 'cal.cellPlanned' : 'cal.cellActivities', {
        date: fmt(d, { day: 'numeric', month: 'long' }),
        n: c,
      });
      return {
        key: ds + S.calMode,
        html: `<button class="${cls}" data-action="calpick" data-date="${ds}" aria-label="${esc(offN ? tr('cal.cellOff', { label, off: offN }) : label)}"><span class="n">${d.getDate()}</span><span class="dots">${dots}</span></button>`,
      };
    }),
  );
  const items = pl ? plannedOn(S.date) : onDate(S.date);
  setHTML(
    $('#calsect'),
    `<h3>${fmt(parse(S.date), { weekday: 'long', day: 'numeric', month: 'long' })}</h3>${!pl && items.length ? `<button class="link" data-action="tab" data-tab="day">${esc(tr('cal.openDay'))}</button>` : ''}`,
  );
  const side = (x) =>
    pl && (x.a.done || []).includes(S.date)
      ? `<span class="next"><b>${esc(tr('tile.done'))}</b>${esc((x.s[0] && x.s[0].start) || '')}</span>`
      : isCancelled(x.a, S.date)
        ? `<span class="next"><b>${esc(tr('tile.cancelled'))}</b>${esc((x.s[0] && x.s[0].start) || '')}</span>`
        : `<span class="next"><b>${esc((x.s[0] && x.s[0].start) || tr('time.anytime'))}</b>${x.s[0] && x.s[0].end ? esc(tr('side.until', { time: x.s[0].end })) : ''}</span>`;
  listOrEmpty(
    $('#callist'),
    'list-card',
    items.map((x) => ({
      key: x.a.id + (isCancelled(x.a, S.date) ? ':off' : ''),
      html: rowHTML(x.a, { side: side(x), off: isCancelled(x.a, S.date) }, S.date),
    })),
    pl
      ? `<p class="note">${esc(tr('cal.emptyPlanned'))}</p>`
      : `<p class="note">${esc(tr('cal.emptyAvail'))}</p>`,
  );
}

function updLib() {
  setHeader(
    tr('lib.title'),
    S.loading && !S.acts.length ? tr('common.loading') : countLabel(S.acts.length),
  );
  const cats = [...new Set(S.acts.flatMap((a) => sportsOf(a.category)))].sort();
  if (!cats.includes(S.cat)) S.cat = 'Alle';
  const provs = [...new Set(S.acts.map((a) => a.provider).filter(Boolean))].sort((x, y) =>
    x.localeCompare(y, loc()),
  );
  if (S.prov && !provs.includes(S.prov)) S.prov = '';
  setHTML(
    $('#provfilter'),
    provs.length
      ? `<div class="provrow"><label class="sr-only" for="provsel">${esc(tr('lib.provider'))}</label><select id="provsel" class="${S.prov ? 'on' : ''}"><option value="">${esc(tr('lib.allProviders'))}</option>${provs.map((p) => `<option value="${esc(p)}"${p === S.prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>`
      : '',
  );
  setHTML(
    $('#chips'),
    cats.length
      ? `<div class="chips">${['Alle', ...cats].map((c) => `<button class="chipbtn ${c === S.cat ? 'on' : ''}" data-action="cat" data-cat="${esc(c)}">${esc(c === 'Alle' ? tr('lib.all') : c)}</button>`).join('')}</div>`
      : '',
  );
  const q = S.q.trim().toLowerCase(),
    nm = nextMap();
  const list = S.acts
    .filter(
      (a) =>
        (S.cat === 'Alle' || sportsOf(a.category).includes(S.cat)) &&
        (!S.prov || a.provider === S.prov) &&
        (!q ||
          [a.name, a.category, a.provider, a.location, a.description]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    )
    .sort((x, y) => x.name.localeCompare(y.name, loc()));
  const items = list.map((a) => {
    const days = new Set();
    let dates = 0;
    for (const s of a.slots || []) {
      if (s.kind === 'date') dates++;
      else for (const d of s.days || []) days.add(d);
    }
    const pills = `<span class="pills">${
      days.size
        ? DAYS()
            .map((d, i) => `<span class="${days.has(i) ? 'on' : ''}">${d}</span>`)
            .join('')
        : ''
    }${dates ? `<em>${days.size ? '&ensp;+' : ''}${esc(tr('lib.dates', { n: dates }))}</em>` : ''}${!days.size && !dates ? `<em>${esc(tr('lib.noTimes'))}</em>` : ''}</span>`;
    const nx = nm.get(a.id);
    const when = !nx
      ? ''
      : nx.i === 0
        ? tr('agenda.today')
        : nx.i === 1
          ? tr('agenda.tomorrow')
          : nx.i < 7
            ? dayShort(wIdx(parse(nx.ds)))
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
      ? emptyHTML('search', esc(tr('lib.nothingFound')), esc(tr('lib.nothingFoundText')))
      : S.loading
        ? '<div class="sk sk-list"></div>'
        : emptyHTML(
            'lib',
            esc(tr('lib.noneYet')),
            esc(tr('lib.noneYetText')),
            `<button class="btn primary" data-action="new">${esc(tr('action.addActivity'))}</button>`,
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
  const addLabel = tr(S.view === 'stats' ? 'stats.addPlan' : 'action.addActivity');
  $('.top .add').setAttribute('aria-label', addLabel);
  setText($('.side-add-label'), addLabel);
  if (S.view !== 'stats') setHTML($('#tools'), '');
  if (mounted !== S.view) {
    $('#view').innerHTML = SKELETON()[S.view];
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
