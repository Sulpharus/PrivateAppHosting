// CAD: start-up, the app shell (tabs, header, offline banner), the projects list, settings,
// Papierkorb and the routes (?projekt=<id>, ?drucken=<id>, ?ansicht=einstellungen).

import { mountEditor } from './editor.js';
import { writeSvg } from './io.js';
import { applyOps, emptyModel } from './model.js';
import { mountPrint } from './print.js';
import { categoryName, createStore } from './store.js';
import {
  contextMenu,
  download,
  el,
  fmt,
  fmtDate,
  helpSheet,
  icon,
  readNumber,
  t,
  typing,
} from './ui.js';

const VERSION = 1;
const COLOURS = ['amber', 'blue', 'green', 'violet', 'rose', 'teal', 'gray'];

const $ = (s) => document.querySelector(s);

async function start() {
  await window.mnI18n.ready;
  const mn = await window.mininode.mininode();
  const user = await mn.auth.requireLogin();
  for (const a of document.querySelectorAll('.mn-home')) a.href = mn.config.portalUrl;
  const store = createStore(mn);
  store.user = user;

  const app = {
    mn,
    store,
    user,
    state: { mode: '2d', chats: new Map(), filter: 'all', query: '', selected: new Set() },
    current: null,
    go,
    setSubtitle: (s) => {
      $('#subtitle').textContent = s;
    },
    shortcuts: () => shortcutsSheet(),
    authorName: () => user.name ?? user.user_metadata?.name ?? '',
  };

  // --- shell -----------------------------------------------------------------------------
  for (const b of document.querySelectorAll('[data-tab]'))
    b.addEventListener('click', () =>
      go(
        b.dataset.tab === 'editor'
          ? { project: app.state.lastProject ?? null, tab: 'editor' }
          : { view: b.dataset.tab },
      ),
    );
  for (const b of document.querySelectorAll('[data-add]'))
    b.addEventListener('click', () => newProjectSheet());
  window.addEventListener('popstate', () => route());

  const offlineBanner = $('#offline');
  async function showOnline() {
    const online = mn.offline.online();
    offlineBanner.hidden = online;
    if (!online) offlineBanner.textContent = t('offline.banner', { n: await mn.offline.pending() });
  }
  mn.offline.onChange(showOnline);
  mn.offline.onSynced(() => {
    showOnline();
    if (!app.current?.editing) route();
  });
  showOnline();

  try {
    await store.loadSettings();
  } catch {
    // Offline on a new device: defaults until the next start.
  }
  // Housekeeping, never blocking the first view.
  store.purgeOld().catch(() => {});
  mn.kv.set('version', VERSION).catch(() => {});

  document.addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.mn-overlay'))
      return;
    if (app.current?.editing) return; // the editor has its own keys
    if (e.key === '?') shortcutsSheet();
  });

  route();

  // --- routing ---------------------------------------------------------------------------
  function go(to) {
    const q = new URLSearchParams();
    if (to.print) q.set('drucken', to.print);
    else if (to.project) q.set('projekt', to.project);
    else if (to.tab === 'editor') q.set('ansicht', 'editor');
    else if (to.view === 'settings') q.set('ansicht', 'einstellungen');
    const url = `${location.pathname}${q.size ? `?${q}` : ''}`;
    history.pushState(null, '', url);
    route();
  }

  async function route() {
    const q = new URLSearchParams(location.search);
    if (app.current?.leave) await app.current.leave();
    app.current = null;
    document.body.classList.remove('cad-printing', 'cad-editing');
    const main = $('#view');
    const tools = $('#tools');
    tools.replaceChildren();
    if (q.has('drucken')) return showPrint(q.get('drucken'));
    if (q.has('projekt')) return showEditor(q.get('projekt'));
    if (q.get('ansicht') === 'editor') {
      selectTab('editor');
      setTitle(t('nav.editor'), '');
      main.replaceChildren(
        emptyState(
          'folder',
          'editor.noProjectTitle',
          'editor.noProjectText',
          'editor.toProjects',
          () => go({ view: 'projects' }),
        ),
      );
      return;
    }
    if (q.get('ansicht') === 'einstellungen') return showSettings();
    return showProjects();
  }

  function selectTab(name) {
    for (const b of document.querySelectorAll('[data-tab]')) {
      if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  }

  function setTitle(title, sub) {
    $('#title').textContent = title;
    $('#subtitle').textContent = sub;
    document.title = `${title} · ${t('app.title')}`;
  }

  // --- projects --------------------------------------------------------------------------
  async function showProjects() {
    selectTab('projects');
    setTitle(t('nav.projects'), '');
    const main = $('#view');
    main.replaceChildren(skeletonList());
    $('#tools').append(
      el(
        'button.mn-icon-btn',
        {
          type: 'button',
          'aria-label': t('projects.help'),
          title: t('projects.help'),
          onclick: () =>
            helpSheet('help.projects.title', [
              'help.projects.p1',
              'help.projects.p2',
              'help.projects.p3',
            ]),
        },
        icon('help'),
      ),
    );
    let projects;
    let categories;
    try {
      [projects, categories] = await Promise.all([store.projects(), store.categories()]);
    } catch {
      main.replaceChildren(errorState(() => showProjects()));
      return;
    }
    app.current = { leave: () => document.removeEventListener('keydown', keys) };
    const byId = new Map(categories.map((c) => [c.id, c]));
    setTitle(t('nav.projects'), t('projects.count', { n: projects.length }));
    main.replaceChildren();
    if (await store.hasSamples().catch(() => false))
      main.append(
        el(
          'div.mn-banner.mn-banner--warn.cad-sample-banner',
          { role: 'note' },
          el('span', {}, t('sample.banner')),
          el(
            'button.mn-btn',
            { type: 'button', onclick: () => removeSamples() },
            t('sample.remove'),
          ),
        ),
      );
    if (!projects.length) {
      main.append(
        el(
          'div.mn-empty',
          {},
          el('div.mn-empty-icon', {}, icon('logo', { size: 32 })),
          el('h3', {}, t('projects.emptyTitle')),
          el('p', {}, t('projects.emptyText')),
          el(
            'button.mn-btn.mn-btn--primary',
            { type: 'button', onclick: () => newProjectSheet() },
            t('projects.first'),
          ),
          el(
            'button.mn-btn.mn-btn--ghost',
            { type: 'button', onclick: () => createSamples() },
            t('projects.tutorial'),
          ),
        ),
      );
      return;
    }
    const search = el('input', {
      type: 'search',
      value: app.state.query,
      placeholder: t('projects.search'),
      'aria-label': t('projects.searchLabel'),
      'aria-keyshortcuts': '/',
    });
    const chips = el('div.mn-chips', { role: 'group', 'aria-label': t('projects.filter') });
    const active = categories.filter((c) => !c.archived);
    const filters = [
      ['all', t('common.all')],
      ...active.map((c) => [c.id, categoryName(c)]),
      ['print', t('purpose.print')],
      ['cnc', t('purpose.cnc')],
      ['drawing', t('purpose.drawing')],
    ];
    for (const [id, label] of filters)
      chips.append(
        el(
          'button.mn-filter',
          {
            type: 'button',
            'aria-pressed': String(app.state.filter === id),
            onclick: (e) => {
              app.state.filter = id;
              window.mnui.select(e.currentTarget);
              draw();
            },
          },
          label,
        ),
      );
    const list = el('div.mn-list.cad-projects');
    const actions = el('div.cad-selbar', {
      role: 'region',
      'aria-label': t('projects.selection'),
      hidden: true,
    });
    main.append(
      el('div.mn-search', {}, icon('search', { size: 18 }), search),
      chips,
      list,
      actions,
    );
    search.addEventListener('input', () => {
      app.state.query = search.value;
      draw();
    });
    let shown = [];
    let lastClicked = null;
    function draw() {
      const q = app.state.query.trim().toLocaleLowerCase(window.mnI18n.locale);
      const f = app.state.filter;
      shown = projects.filter(
        (p) =>
          (f === 'all' || p.category_id === f || p.purpose === f) &&
          (!q ||
            `${p.name} ${p.notes} ${categoryName(byId.get(p.category_id))}`
              .toLocaleLowerCase(window.mnI18n.locale)
              .includes(q)),
      );
      list.replaceChildren();
      if (!shown.length) list.append(el('p.mn-note.cad-pad', {}, t('projects.noMatch')));
      for (const p of shown) list.append(row(p));
      drawSelbar();
    }
    function row(p) {
      const cat = byId.get(p.category_id);
      const check = el('input.cad-check', {
        type: 'checkbox',
        checked: app.state.selected.has(p.id),
        'aria-label': t('projects.select', { name: p.name }),
        onclick: (e) => {
          e.stopPropagation();
          toggle(p.id, e.shiftKey);
        },
      });
      const open = el(
        'button.mn-row',
        {
          type: 'button',
          dataset: { id: p.id },
          onclick: (e) => {
            if (e.shiftKey || app.state.selected.size) {
              toggle(p.id, e.shiftKey);
              return;
            }
            openProject(p.id);
          },
          oncontextmenu: (e) => {
            e.preventDefault();
            projectMenu(p, e.clientX, e.clientY, e.currentTarget);
          },
        },
        thumb(p),
        el(
          'span',
          {},
          el(
            'span.mn-row-title',
            {},
            p.name,
            p.sample
              ? el('span.mn-chip.mn-chip--plain.cad-sample-chip', {}, t('sample.chip'))
              : null,
          ),
          el(
            'span.mn-row-sub',
            {},
            [
              cat ? categoryName(cat) : null,
              t(`purpose.${p.purpose}`),
              p.updated_at ? t('projects.updated', { date: fmtDate(p.updated_at) }) : null,
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        ),
        el(
          'span.mn-row-side',
          {},
          el('b.mn-num', {}, String(p.model.solids.length)),
          t('projects.solids', { n: p.model.solids.length }),
        ),
      );
      const more = el(
        'button.mn-icon-btn.cad-row-more',
        {
          type: 'button',
          'aria-label': t('projects.more', { name: p.name }),
          onclick: (e) => projectMenu(p, e.clientX, e.clientY, e.currentTarget),
        },
        icon('more'),
      );
      const wrap = el('div.cad-project', {}, check, open, more);
      wrap.classList.toggle('is-selected', app.state.selected.has(p.id));
      return wrap;
    }
    function toggle(id, range) {
      const sel = app.state.selected;
      if (range && lastClicked) {
        const ids = shown.map((p) => p.id);
        const [a, b] = [ids.indexOf(lastClicked), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) for (const x of ids.slice(a, b + 1)) sel.add(x);
      } else if (sel.has(id)) sel.delete(id);
      else sel.add(id);
      lastClicked = id;
      draw();
    }
    function drawSelbar() {
      const sel = projects.filter((p) => app.state.selected.has(p.id));
      actions.hidden = !sel.length;
      actions.replaceChildren();
      if (!sel.length) return;
      const catSel = el(
        'select',
        {
          'aria-label': t('projects.moveTo'),
          onchange: async (e) => {
            const v = e.target.value || null;
            for (const p of sel) await store.saveProject({ ...p, category_id: v });
            app.state.selected.clear();
            window.mnui.toast(t('projects.moved', { n: sel.length }));
            showProjects();
          },
        },
        el('option', { value: '', selected: true, disabled: true }, t('projects.moveTo')),
        el('option', { value: '' }, t('projects.noCategory')),
        ...active.map((c) => el('option', { value: c.id }, categoryName(c))),
      );
      actions.append(
        el('span', {}, t('projects.selected', { n: sel.length })),
        catSel,
        el(
          'button.mn-btn.mn-btn--danger',
          { type: 'button', onclick: () => trashProjects(sel) },
          t('common.delete'),
        ),
        el(
          'button.mn-btn.mn-btn--ghost',
          {
            type: 'button',
            onclick: () => {
              app.state.selected.clear();
              draw();
            },
          },
          t('projects.clearSelection'),
        ),
      );
    }
    function keys(e) {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.mn-overlay'))
        return;
      const rows = [...list.querySelectorAll('.mn-row')];
      const i = rows.indexOf(document.activeElement);
      if (e.key === 'n') {
        e.preventDefault();
        newProjectSheet();
      } else if (e.key === '/') {
        e.preventDefault();
        search.focus();
      } else if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const next =
          rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'j' ? 1 : -1)))] ?? rows[0];
        next?.focus();
      } else if (e.key === 'x' && i >= 0) toggle(rows[i].dataset.id, e.shiftKey);
      else if (e.key === 'e' && i >= 0)
        editProjectSheet(projects.find((p) => p.id === rows[i].dataset.id));
      else if (e.key === 'Delete' && app.state.selected.size)
        trashProjects(projects.filter((p) => app.state.selected.has(p.id)));
    }
    document.addEventListener('keydown', keys);
    draw();
  }

  function thumb(p) {
    const holder = el('span.mn-thumb.cad-thumb', { 'aria-hidden': 'true' });
    const ents = p.model.sketch.entities;
    if (ents.length) {
      const svg = writeSvg(ents.slice(0, 1500), { margin: 2, stroke: 0 })
        .replace('stroke="black"', 'stroke="currentColor"')
        .replace(/fill="black"/g, 'fill="currentColor"');
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const node = document.importNode(doc.documentElement, true);
      node.removeAttribute('width');
      node.removeAttribute('height');
      node.setAttribute('vector-effect', 'non-scaling-stroke');
      for (const g of node.querySelectorAll('*'))
        g.setAttribute('vector-effect', 'non-scaling-stroke');
      node.querySelector('g')?.setAttribute('stroke-width', '1');
      holder.append(node);
    } else holder.append(icon(p.model.solids.length ? 'cube3d' : 'drawing', { size: 26 }));
    return holder;
  }

  function projectMenu(p, x, y, back) {
    contextMenu(
      x,
      y,
      [
        { label: t('projects.open'), icon: 'pencil', onClick: () => openProject(p.id) },
        { label: t('common.edit'), icon: 'settings', onClick: () => editProjectSheet(p) },
        { label: t('projects.duplicate'), icon: 'copy', onClick: () => duplicateProject(p) },
        { label: t('editor.print'), icon: 'print', onClick: () => go({ print: p.id }) },
        {
          label: t('common.delete'),
          icon: 'trash',
          danger: true,
          onClick: () => trashProjects([p]),
        },
      ],
      back,
    );
  }

  function openProject(id) {
    app.state.selected.clear();
    go({ project: id });
  }

  async function duplicateProject(p) {
    const copy = store.newProject({
      name: t('projects.copyName', { name: p.name }).slice(0, 120),
      purpose: p.purpose,
      category_id: p.category_id,
      model: structuredClone(p.model),
    });
    copy.notes = p.notes;
    await store.saveProject(copy);
    window.mnui.toast(t('projects.duplicated'));
    showProjects();
  }

  async function trashProjects(list) {
    // Many at once: ask first, with the count. One: delete at once with undo.
    if (list.length > 1) {
      const ok = await confirmSheet(
        t('projects.trashManyTitle', { n: list.length }),
        t('projects.trashManyText', { n: list.length }),
        t('common.delete'),
      );
      if (!ok) return;
    }
    await store.trashProjects(list);
    app.state.selected.clear();
    window.mnui.toast(t('projects.trashed', { n: list.length }), {
      action: {
        label: t('common.undo'),
        onClick: async () => {
          await store.restoreProjects(list);
          route();
        },
      },
    });
    route();
  }

  function confirmSheet(title, text, label) {
    return new Promise((resolve) => {
      let answered = false;
      const yes = el(
        'button.mn-btn.mn-btn--danger',
        {
          type: 'button',
          onclick: () => {
            answered = true;
            window.mnui.sheet.close();
            resolve(true);
          },
        },
        label,
      );
      const node = el(
        'div',
        {},
        el(
          'div.mn-sheet-bar',
          {},
          el(
            'button.mn-btn.mn-btn--ghost',
            { type: 'button', 'data-mn-close': '' },
            t('common.cancel'),
          ),
          el('h2', {}, title),
          el('span'),
        ),
        el('div.mn-sheet-body', {}, el('p', {}, text)),
        el('div.mn-sheet-foot', {}, el('span.mn-grow'), yes),
      );
      window.mnui.sheet.open(node, { onClose: () => !answered && resolve(false) });
    });
  }

  // --- project editor sheet --------------------------------------------------------------
  async function newProjectSheet() {
    projectSheet(null);
  }
  async function editProjectSheet(p) {
    projectSheet(p);
  }

  async function projectSheet(p) {
    let categories = [];
    try {
      categories = (await store.categories()).filter((c) => !c.archived || c.id === p?.category_id);
    } catch {}
    const name = el('input', {
      name: 'name',
      required: true,
      maxlength: '120',
      value: p?.name ?? '',
    });
    const purpose = el('div.mn-seg', { role: 'group', 'aria-label': t('project.purpose') });
    let purposeValue = p?.purpose ?? 'print';
    for (const v of ['print', 'cnc', 'drawing'])
      purpose.append(
        el(
          'button',
          {
            type: 'button',
            'aria-pressed': String(v === purposeValue),
            onclick: (e) => {
              purposeValue = v;
              window.mnui.select(e.currentTarget);
            },
          },
          t(`purpose.${v}`),
        ),
      );
    const cat = el(
      'select',
      {},
      el('option', { value: '' }, t('projects.noCategory')),
      ...categories.map((c) =>
        el('option', { value: c.id, selected: c.id === p?.category_id }, categoryName(c)),
      ),
    );
    const notes = el('textarea', { rows: '3', maxlength: '5000' });
    notes.value = p?.notes ?? '';
    const err = el('p.mn-error', { role: 'alert', hidden: true });
    const form = el(
      'form.mn-form.mn-sheet-body',
      { novalidate: true },
      el(
        'fieldset',
        {},
        el('legend', {}, t('project.legend')),
        el('label.mn-field', {}, t('project.name'), name),
        el('div.mn-field', {}, t('project.purpose'), purpose),
        el('label.mn-field', {}, t('project.category'), cat),
      ),
      el(
        'details.mn-more',
        {},
        el('summary', {}, t('project.more')),
        el('div', {}, el('label.mn-field', {}, t('project.notes'), notes)),
      ),
      err,
    );
    const saveBtn = el(
      'button.mn-btn.mn-btn--primary',
      { type: 'submit' },
      t(p ? 'common.save' : 'project.create'),
    );
    const foot = el('div.mn-sheet-foot', {}, el('span.mn-grow'), saveBtn);
    form.append(foot);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!name.value.trim()) {
        err.hidden = false;
        err.textContent = t('project.nameError');
        name.setAttribute('aria-invalid', 'true');
        name.focus();
        return;
      }
      saveBtn.disabled = true;
      try {
        if (p) {
          await store.saveProject({
            ...p,
            name: name.value.trim(),
            purpose: purposeValue,
            category_id: cat.value || null,
            notes: notes.value,
          });
          window.mnui.sheet.close();
          window.mnui.toast(t('project.saved'));
          route();
        } else {
          const row = store.newProject({
            name: name.value.trim(),
            purpose: purposeValue,
            category_id: cat.value || null,
          });
          row.notes = notes.value;
          await store.saveProject(row);
          window.mnui.sheet.close();
          window.mnui.toast(t('project.created'));
          app.state.mode = purposeValue === 'print' ? '3d' : '2d';
          go({ project: row.id });
        }
      } catch {
        saveBtn.disabled = false;
        err.hidden = false;
        err.textContent = t('common.saveError');
      }
    });
    const node = el(
      'div',
      {},
      el(
        'div.mn-sheet-bar',
        {},
        el(
          'button.mn-btn.mn-btn--ghost',
          { type: 'button', 'data-mn-close': '' },
          t('common.cancel'),
        ),
        el('h2', {}, t(p ? 'project.editTitle' : 'project.newTitle')),
        el('span'),
      ),
      form,
    );
    window.mnui.sheet.open(node, { tall: true, modal: true });
    name.focus();
  }

  // --- editor and print ------------------------------------------------------------------
  async function showEditor(id) {
    selectTab('editor');
    const main = $('#view');
    main.replaceChildren(el('span.mn-sk', { style: { height: '60vh' } }));
    let project;
    try {
      project = await store.project(id);
    } catch {
      main.replaceChildren(errorState(() => showEditor(id)));
      return;
    }
    if (!project || project.deleted_at) {
      setTitle(t('nav.editor'), '');
      main.replaceChildren(
        emptyState('folder', 'editor.missingTitle', 'editor.missingText', 'editor.toProjects', () =>
          go({ view: 'projects' }),
        ),
      );
      return;
    }
    app.state.lastProject = id;
    document.body.classList.add('cad-editing');
    setTitle(project.name, '');
    $('#tools').append(
      el(
        'button.mn-icon-btn',
        {
          type: 'button',
          'aria-label': t('common.edit'),
          title: t('common.edit'),
          onclick: () => editProjectSheet(project),
        },
        icon('settings'),
      ),
    );
    const handle = mountEditor(main, app, project);
    app.current = { editing: true, leave: () => handle.leave() };
  }

  async function showPrint(id) {
    selectTab('editor');
    const main = $('#view');
    main.replaceChildren(el('span.mn-sk', { style: { height: '60vh' } }));
    let project;
    try {
      project = await store.project(id);
    } catch {
      main.replaceChildren(errorState(() => showPrint(id)));
      return;
    }
    if (!project) {
      main.replaceChildren(
        emptyState('folder', 'editor.missingTitle', 'editor.missingText', 'editor.toProjects', () =>
          go({ view: 'projects' }),
        ),
      );
      return;
    }
    document.body.classList.add('cad-printing');
    setTitle(t('print.title'), project.name);
    app.current = mountPrint(main, app, project);
  }

  // --- settings --------------------------------------------------------------------------
  async function showSettings() {
    selectTab('settings');
    setTitle(t('nav.settings'), '');
    const main = $('#view');
    main.replaceChildren(skeletonList());
    let categories;
    try {
      categories = await store.categories();
    } catch {
      main.replaceChildren(errorState(() => showSettings()));
      return;
    }
    const s = store.settings;
    const set = async (patch, toastKey) => {
      await store.saveSettings(patch);
      if (toastKey) window.mnui.toast(t(toastKey));
    };
    const seg = (label, key, options) => {
      const g = el('div.mn-seg', { role: 'group', 'aria-label': label });
      for (const [v, l] of options)
        g.append(
          el(
            'button',
            {
              type: 'button',
              'aria-pressed': String(s[key] === v),
              onclick: async (e) => {
                window.mnui.select(e.currentTarget);
                await set({ [key]: v }, 'settings.saved');
              },
            },
            l,
          ),
        );
      return el('div.mn-field', {}, label, g);
    };
    const num = (label, value, onSave, suffix) => {
      const input = el('input', { type: 'text', inputmode: 'decimal', value: fmt(value, 4) });
      const err = el('p.mn-error', { role: 'alert', hidden: true });
      input.addEventListener('change', async () => {
        const v = readNumber(input.value);
        if (v === null || v <= 0) {
          err.hidden = false;
          err.textContent = t('editor.numberError');
          input.setAttribute('aria-invalid', 'true');
          return;
        }
        err.hidden = true;
        input.removeAttribute('aria-invalid');
        await onSave(v);
        window.mnui.toast(t('settings.saved'));
      });
      return el('label.mn-field', {}, `${label}${suffix ? ` (${suffix})` : ''}`, input, err);
    };
    const check = (label, key) => {
      const c = el('input', { type: 'checkbox', checked: Boolean(s[key]) });
      c.addEventListener('change', () => set({ [key]: c.checked }, 'settings.saved'));
      return el('label', {}, c, label);
    };
    const card = (titleKey, ...children) =>
      el('section.mn-card.cad-settings-card', {}, el('h2', {}, t(titleKey)), ...children);

    const general = card(
      'settings.general',
      seg(t('settings.units'), 'units', [
        ['mm', t('settings.mm')],
        ['in', t('settings.in')],
      ]),
      num(t('settings.grid'), s.grid, (v) => store.saveSettings({ grid: v }), 'mm'),
      el(
        'div.mn-checks',
        {},
        check(t('settings.gridVisible'), 'gridVisible'),
        check(t('settings.showHidden'), 'showHidden'),
      ),
      seg(t('settings.projection'), 'projection', [
        ['first', t('views.first')],
        ['third', t('views.third')],
      ]),
      seg(t('settings.paper'), 'paper', [
        ['A4', 'A4'],
        ['A3', 'A3'],
        ['A2', 'A2'],
      ]),
      seg(t('print.orientation'), 'orientation', [
        ['landscape', t('print.landscape')],
        ['portrait', t('print.portrait')],
      ]),
    );
    const p = s.printer;
    const printer = card(
      'settings.printer',
      el(
        'div.mn-grid-2',
        {},
        num(
          t('settings.bedX'),
          p.x,
          (v) => store.saveSettings({ printer: { ...store.settings.printer, x: v } }),
          'mm',
        ),
        num(
          t('settings.bedY'),
          p.y,
          (v) => store.saveSettings({ printer: { ...store.settings.printer, y: v } }),
          'mm',
        ),
      ),
      el(
        'div.mn-grid-2',
        {},
        num(
          t('settings.bedZ'),
          p.z,
          (v) => store.saveSettings({ printer: { ...store.settings.printer, z: v } }),
          'mm',
        ),
        num(
          t('settings.density'),
          p.density,
          (v) => store.saveSettings({ printer: { ...store.settings.printer, density: v } }),
          'g/cm³',
        ),
      ),
      el('p.mn-hint', {}, t('settings.printerHint')),
    );
    const c = s.cam;
    const camNum = (k, label, suffix) =>
      num(
        label,
        c[k],
        (v) => store.saveSettings({ cam: { ...store.settings.cam, [k]: v } }),
        suffix,
      );
    const cnc = card(
      'settings.cnc',
      el(
        'div.mn-grid-2',
        {},
        camNum('tool', t('cam.tool'), 'mm'),
        camNum('depth', t('cam.depth'), 'mm'),
      ),
      el(
        'div.mn-grid-2',
        {},
        camNum('step', t('cam.step'), 'mm'),
        camNum('safeZ', t('cam.safeZ'), 'mm'),
      ),
      el('div.mn-grid-2', {}, camNum('feed', t('cam.feed')), camNum('plunge', t('cam.plunge'))),
      camNum('rpm', t('cam.rpm')),
    );
    const ai = card(
      'settings.ai',
      seg(t('settings.aiModel'), 'aiModel', [
        ['claude-sonnet', t('settings.aiPrecise')],
        ['gemini-flash', t('settings.aiFast')],
      ]),
      el('p.mn-hint', {}, t('settings.aiHint')),
    );

    // Categories
    const catList = el('div.mn-list');
    const drawCats = () => {
      catList.replaceChildren();
      if (!categories.length) catList.append(el('p.mn-note.cad-pad', {}, t('categories.empty')));
      categories.forEach((cat, i) => {
        const nameInput = el('input', {
          type: 'text',
          value: categoryName(cat),
          maxlength: '80',
          'aria-label': t('categories.name'),
        });
        nameInput.addEventListener('change', async () => {
          if (!nameInput.value.trim()) return;
          cat.name = nameInput.value.trim();
          await store.saveCategory(cat);
          window.mnui.toast(t('categories.saved'));
        });
        const colour = el(
          'select',
          { 'aria-label': t('categories.colour'), dataset: { cat: cat.colour } },
          ...COLOURS.map((k) =>
            el('option', { value: k, selected: k === cat.colour }, t(`colour.${k}`)),
          ),
        );
        colour.addEventListener('change', async () => {
          cat.colour = colour.value;
          colour.dataset.cat = cat.colour;
          await store.saveCategory(cat);
        });
        const move = async (d) => {
          const j = i + d;
          if (j < 0 || j >= categories.length) return;
          [categories[i], categories[j]] = [categories[j], categories[i]];
          for (const [k, x] of categories.entries()) {
            x.position = k;
            await store.saveCategory(x);
          }
          drawCats();
        };
        catList.append(
          el(
            'div.mn-row.mn-row--text.cad-cat-row',
            { dataset: { cat: cat.colour } },
            el('span.cad-cat-dot', { 'aria-hidden': 'true' }),
            nameInput,
            colour,
            el(
              'span.cad-cat-actions',
              {},
              el(
                'button.mn-icon-btn',
                {
                  type: 'button',
                  'aria-label': t('categories.up', { name: categoryName(cat) }),
                  disabled: i === 0,
                  onclick: () => move(-1),
                },
                icon('up'),
              ),
              el(
                'button.mn-icon-btn',
                {
                  type: 'button',
                  'aria-label': t('categories.down', { name: categoryName(cat) }),
                  disabled: i === categories.length - 1,
                  onclick: () => move(1),
                },
                icon('down'),
              ),
              el(
                'button.mn-btn.mn-btn--ghost',
                {
                  type: 'button',
                  onclick: async () => {
                    cat.archived = !cat.archived;
                    await store.saveCategory(cat);
                    window.mnui.toast(
                      t(cat.archived ? 'categories.archived' : 'categories.restored'),
                    );
                    drawCats();
                  },
                },
                t(cat.archived ? 'categories.unarchive' : 'categories.archive'),
              ),
            ),
          ),
        );
      });
    };
    drawCats();
    const newCat = el('input', {
      type: 'text',
      maxlength: '80',
      placeholder: t('categories.newPlaceholder'),
      'aria-label': t('categories.new'),
    });
    const addCat = el(
      'form.cad-inline-form',
      {},
      newCat,
      el('button.mn-btn', { type: 'submit' }, t('common.add')),
    );
    addCat.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!newCat.value.trim()) return;
      const cat = store.newCategory(
        newCat.value.trim(),
        COLOURS[categories.length % COLOURS.length],
        categories.length,
      );
      await store.saveCategory(cat);
      categories.push(cat);
      newCat.value = '';
      drawCats();
      window.mnui.toast(t('categories.added'));
    });
    const cats = card(
      'settings.categories',
      el('p.mn-hint', {}, t('categories.hint')),
      catList,
      addCat,
    );

    // Data
    const importInput = el('input', {
      type: 'file',
      accept: '.json,application/json',
      hidden: true,
    });
    importInput.addEventListener('change', async () => {
      const f = importInput.files?.[0];
      importInput.value = '';
      if (!f) return;
      try {
        const n = await store.importAll(JSON.parse(await f.text()));
        window.mnui.toast(t('data.imported', { n }));
      } catch {
        window.mnui.toast(t('data.importError'));
      }
    });
    const hasSamples = await store.hasSamples().catch(() => false);
    const data = card(
      'settings.data',
      el(
        'div.cad-card-actions',
        {},
        el(
          'button.mn-btn',
          {
            type: 'button',
            onclick: async () => {
              const d = await store.exportAll();
              download(
                new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }),
                `cad-${new Date().toISOString().slice(0, 10)}.json`,
              );
              window.mnui.toast(t('data.exported'));
            },
          },
          t('data.export'),
        ),
        el(
          'button.mn-btn',
          { type: 'button', onclick: () => importInput.click() },
          t('data.import'),
        ),
        importInput,
        el(
          'button.mn-btn',
          { type: 'button', onclick: () => trashSheet() },
          icon('trash', { size: 18 }),
          t('trash.title'),
        ),
        hasSamples
          ? el(
              'button.mn-btn',
              { type: 'button', onclick: () => removeSamples() },
              t('sample.remove'),
            )
          : null,
      ),
      el('p.mn-hint', {}, t('data.hint')),
      el(
        'button.mn-btn.mn-btn--danger',
        { type: 'button', onclick: () => deleteAllSheet() },
        t('data.deleteAll'),
      ),
    );
    const account = card(
      'settings.account',
      el('p.mn-hint', {}, t('settings.accountHint')),
      el(
        'div.cad-card-actions',
        {},
        el('a.mn-btn', { href: mn.auth.accountUrl() }, t('settings.accountLink')),
        el(
          'button.mn-btn',
          {
            type: 'button',
            onclick: async () => {
              await mn.auth.signOut();
              location.href = mn.config.portalUrl;
            },
          },
          t('settings.signOut'),
        ),
      ),
    );
    const help = card(
      'settings.help',
      el(
        'div.cad-card-actions',
        {},
        el(
          'button.mn-btn',
          {
            type: 'button',
            onclick: () =>
              helpSheet('help.editor.title', [
                'help.editor.p1',
                'help.editor.p2',
                'help.editor.p3',
                'help.editor.p4',
                'help.editor.p5',
              ]),
          },
          t('settings.guide'),
        ),
        el(
          'button.mn-btn',
          { type: 'button', onclick: () => shortcutsSheet() },
          icon('keyboard', { size: 18 }),
          t('shortcuts.title'),
        ),
        el(
          'button.mn-btn',
          {
            type: 'button',
            onclick: async () => {
              await store.resetHints();
              window.mnui.toast(t('settings.hintsReset'));
            },
          },
          t('settings.resetHints'),
        ),
      ),
    );
    main.replaceChildren(
      el('div.cad-settings', {}, general, printer, cnc, ai, cats, data, account, help),
    );
  }

  async function trashSheet() {
    const body = el('div', {}, el('span.mn-sk', { style: { height: '56px' } }));
    const node = el(
      'div',
      {},
      el(
        'div.mn-sheet-bar',
        {},
        el(
          'button.mn-btn.mn-btn--ghost',
          { type: 'button', 'data-mn-close': '' },
          t('common.close'),
        ),
        el('h2', {}, t('trash.title')),
        el('span'),
      ),
      el('div.mn-sheet-body', {}, body),
    );
    window.mnui.sheet.open(node, { tall: true });
    let items;
    try {
      items = await store.trash();
    } catch {
      body.replaceChildren(errorState(() => trashSheet()));
      return;
    }
    body.replaceChildren(el('p.mn-hint', {}, t('trash.hint')));
    if (!items.length) {
      body.append(
        el('div.mn-empty', {}, el('h3', {}, t('trash.empty')), el('p', {}, t('trash.emptyText'))),
      );
      return;
    }
    const list = el('div.mn-list');
    for (const p of items) {
      list.append(
        el(
          'div.mn-row.mn-row--text',
          {},
          el(
            'span',
            {},
            el('span.mn-row-title', {}, p.name),
            el('span.mn-row-sub', {}, t('trash.deletedOn', { date: fmtDate(p.deleted_at) })),
          ),
          el(
            'span.mn-row-side.cad-trash-actions',
            {},
            el(
              'button.mn-btn',
              {
                type: 'button',
                onclick: async () => {
                  await store.restoreProjects([p]);
                  window.mnui.toast(t('trash.restored'));
                  trashSheet();
                },
              },
              t('trash.restore'),
            ),
            el(
              'button.mn-btn.mn-btn--danger',
              {
                type: 'button',
                onclick: async (e) => {
                  const b = e.currentTarget;
                  if (b.dataset.armed !== '1') {
                    b.dataset.armed = '1';
                    b.textContent = t('trash.confirm');
                    return;
                  }
                  await store.purgeProject(p);
                  window.mnui.toast(t('trash.purged'));
                  trashSheet();
                },
              },
              t('trash.purge'),
            ),
          ),
        ),
      );
    }
    body.append(list);
  }

  function deleteAllSheet() {
    const word = t('data.deleteWord');
    const input = el('input', {
      type: 'text',
      autocomplete: 'off',
      'aria-label': t('data.deleteTypeLabel', { word }),
    });
    const go2 = el(
      'button.mn-btn.mn-btn--danger',
      { type: 'button', disabled: true },
      t('data.deleteAll'),
    );
    input.addEventListener('input', () => {
      go2.disabled = input.value.trim().toLocaleLowerCase(window.mnI18n.locale) !== word;
    });
    go2.addEventListener('click', async () => {
      go2.disabled = true;
      await store.deleteAll();
      window.mnui.sheet.close();
      window.mnui.toast(t('data.deleted'));
      go({ view: 'projects' });
    });
    const node = el(
      'div',
      {},
      el(
        'div.mn-sheet-bar',
        {},
        el(
          'button.mn-btn.mn-btn--ghost',
          { type: 'button', 'data-mn-close': '' },
          t('common.cancel'),
        ),
        el('h2', {}, t('data.deleteAll')),
        el('span'),
      ),
      el(
        'div.mn-sheet-body.mn-form',
        {},
        el('p', {}, t('data.deleteText')),
        el('label.mn-field', {}, t('data.deleteTypeLabel', { word }), input),
      ),
      el('div.mn-sheet-foot', {}, el('span.mn-grow'), go2),
    );
    window.mnui.sheet.open(node, { modal: true });
  }

  // --- sample data -----------------------------------------------------------------------
  async function createSamples() {
    try {
      const cPrint = store.newCategory(t('sample.catPrint'), 'amber', 0, true);
      const cCnc = store.newCategory(t('sample.catCnc'), 'blue', 1, true);
      await store.saveCategory(cPrint);
      await store.saveCategory(cCnc);
      // 1. An angle bracket for the 3D printer, with holes and generated views.
      let m = applyOps(emptyModel(), [
        { op: 'add_box', x: 0, y: 0, z: 0, w: 60, d: 40, h: 5, name: t('sample.base') },
        { op: 'add_box', x: 0, y: 35, z: 5, w: 60, d: 5, h: 35, name: t('sample.wall') },
        {
          op: 'add_cylinder',
          x: 15,
          y: 17.5,
          z: -1,
          r: 2.75,
          h: 7,
          mode: 'subtract',
          name: t('solid.hole'),
        },
        {
          op: 'add_cylinder',
          x: 45,
          y: 17.5,
          z: -1,
          r: 2.75,
          h: 7,
          mode: 'subtract',
          name: t('solid.hole'),
        },
        {
          op: 'add_cylinder',
          x: 30,
          y: 34,
          z: 27,
          r: 3.25,
          h: 7,
          rx: -90,
          mode: 'subtract',
          name: t('solid.hole'),
        },
        { op: 'set_sheet', title: t('sample.bracket'), material: 'PLA', scale: '1:1' },
      ]).model;
      m = applyOps(m, [{ op: 'generate_views', views: ['front', 'top', 'left', 'iso'] }]).model;
      const p1 = store.newProject({
        name: t('sample.bracket'),
        purpose: 'print',
        category_id: cPrint.id,
        sample: true,
        model: m,
      });
      p1.notes = t('sample.bracketNotes');
      await store.saveProject(p1);
      // 2. A cover plate for the CNC router: outline, four holes, a pocket, dimensions.
      const plate = applyOps(emptyModel(), [
        { op: 'add_rect', x: 0, y: 0, w: 120, h: 80 },
        { op: 'add_circle', cx: 10, cy: 10, r: 2.5 },
        { op: 'add_circle', cx: 110, cy: 10, r: 2.5 },
        { op: 'add_circle', cx: 110, cy: 70, r: 2.5 },
        { op: 'add_circle', cx: 10, cy: 70, r: 2.5 },
        { op: 'add_circle', cx: 60, cy: 40, r: 15 },
        { op: 'add_line', x1: 60, y1: 20, x2: 60, y2: 60, style: 'center' },
        { op: 'add_line', x1: 40, y1: 40, x2: 80, y2: 40, style: 'center' },
        { op: 'add_dimension', x1: 0, y1: 0, x2: 120, y2: 0, kind: 'h', offset: -12 },
        { op: 'add_dimension', x1: 0, y1: 0, x2: 0, y2: 80, kind: 'v', offset: 12 },
        { op: 'add_dimension', x1: 45, y1: 40, x2: 75, y2: 40, kind: 'h', offset: 24 },
        { op: 'add_text', x: 0, y: 88, text: t('sample.plateText'), size: 4 },
        { op: 'extrude', target: 'e1', h: 6 },
        { op: 'set_sheet', title: t('sample.plate'), material: 'AlMg3 6 mm', scale: '1:1' },
      ]).model;
      const p2 = store.newProject({
        name: t('sample.plate'),
        purpose: 'cnc',
        category_id: cCnc.id,
        sample: true,
        model: plate,
      });
      p2.notes = t('sample.plateNotes');
      await store.saveProject(p2);
      window.mnui.toast(t('sample.created'));
      app.state.mode = '3d';
      go({ project: p1.id });
    } catch {
      window.mnui.toast(t('common.saveError'));
    }
  }

  async function removeSamples() {
    await store.removeSamples();
    window.mnui.toast(t('sample.removed'));
    route();
  }

  // --- small parts -----------------------------------------------------------------------
  function shortcutsSheet() {
    const rows = [
      ['N', 'shortcuts.new'],
      ['/', 'shortcuts.search'],
      ['J / K', 'shortcuts.nextPrev'],
      ['X', 'shortcuts.select'],
      ['E', 'shortcuts.edit'],
      ['1 / 2', 'shortcuts.modes'],
      ['V L P R C A D T', 'shortcuts.tools'],
      ['B Z H E', 'shortcuts.tools3d'],
      ['F', 'shortcuts.fit'],
      ['G / O', 'shortcuts.snap'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'shortcuts.undo'],
      ['Ctrl+D', 'shortcuts.duplicate'],
      ['Entf / Delete', 'shortcuts.delete'],
      ['Esc', 'shortcuts.escape'],
      [t('shortcuts.spaceKey'), 'shortcuts.pan'],
    ];
    const node = el(
      'div',
      {},
      el(
        'div.mn-sheet-bar',
        {},
        el(
          'button.mn-btn.mn-btn--ghost',
          { type: 'button', 'data-mn-close': '' },
          t('common.close'),
        ),
        el('h2', {}, t('shortcuts.title')),
        el('span'),
      ),
      el(
        'div.mn-sheet-body',
        {},
        el(
          'dl.mn-facts',
          {},
          ...rows.map(([k, d]) =>
            el('div', {}, el('dt', {}, el('kbd', {}, k)), el('dd', {}, t(d))),
          ),
        ),
      ),
    );
    window.mnui.sheet.open(node, { tall: true });
  }

  function skeletonList() {
    return el(
      'div.cad-skeleton',
      {},
      ...[1, 2, 3, 4].map(() => el('span.mn-sk', { style: { height: '72px' } })),
    );
  }

  function errorState(retry) {
    return el(
      'div.mn-empty',
      {},
      el('h3', {}, t('common.loadErrorTitle')),
      el('p', {}, t('common.loadError')),
      el('button.mn-btn', { type: 'button', onclick: retry }, t('common.retry')),
    );
  }

  function emptyState(ic, titleKey, textKey, actionKey, onClick) {
    return el(
      'div.mn-empty',
      {},
      el('div.mn-empty-icon', {}, icon(ic, { size: 32 })),
      el('h3', {}, t(titleKey)),
      el('p', {}, t(textKey)),
      el('button.mn-btn.mn-btn--primary', { type: 'button', onclick: onClick }, t(actionKey)),
    );
  }
}

start().catch((err) => {
  const main = document.querySelector('#view');
  if (main) {
    main.replaceChildren();
    const box = document.createElement('div');
    box.className = 'mn-empty';
    const h = document.createElement('h3');
    h.textContent = window.mnI18n?.t('common.startError') ?? 'CAD';
    const b = document.createElement('button');
    b.className = 'mn-btn';
    b.type = 'button';
    b.textContent = window.mnI18n?.t('common.retry') ?? '↻';
    b.addEventListener('click', () => location.reload());
    box.append(h, b);
    main.append(box);
  }
  console.error(err);
});
