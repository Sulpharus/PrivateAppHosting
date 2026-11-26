// Start-up, the shell (navigation, header, offline banner), the router and keyboard shortcuts.
import { remindOverdue, uploadMissingPdfs } from './actions.js';
import { app, DEFAULT_COMPANY, DEFAULT_SETTINGS } from './ctx.js';
import { errorBox, h, skeleton, t } from './dom.js';
import { openCustomerEditor, openInvoiceEditor, openItemEditor } from './editors.js';
import { helpButton, loadSeen, openShortcuts } from './help.js';
import { purgeOld } from './settings.js';
import { createStore } from './store.js';
import { VIEWS } from './views.js';

const main = document.getElementById('view');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('subtitle');
const toolsEl = document.getElementById('tools');
const bannerEl = document.getElementById('banner');
let loaded = false;
let loadError = null;

// ---------- router ----------
const params = () => new URLSearchParams(window.location.search);
export function currentView() {
  const view = params().get('view') ?? 'overview';
  return VIEWS[view] ? view : 'overview';
}

app.go = (view, extra = {}, { replace = false } = {}) => {
  const next = new URLSearchParams();
  if (view !== 'overview') next.set('view', view);
  for (const [k, v] of Object.entries(extra))
    if (v !== undefined && v !== null && v !== '') next.set(k, v);
  const url = `${window.location.pathname}${next.toString() ? `?${next}` : ''}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  render();
};
/** Changes the query of the current view without a new history entry. */
app.setQuery = (patch) => {
  const next = params();
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '' || v === false) next.delete(k);
    else next.set(k, String(v));
  }
  history.replaceState(null, '', `${window.location.pathname}${next.toString() ? `?${next}` : ''}`);
};
app.params = params;
window.addEventListener('popstate', () => render());

// ---------- shell ----------
function addAction(view) {
  if (view === 'customers') return { label: t('customers.add'), run: () => openCustomerEditor() };
  if (view === 'items') return { label: t('items.add'), run: () => openItemEditor() };
  if (['stats', 'settings', 'print'].includes(view)) return null;
  return { label: t('invoices.add'), run: () => openInvoiceEditor() };
}

function renderShell(view) {
  for (const tab of document.querySelectorAll('.mn-tab'))
    if (tab.dataset.tab === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  const action = addAction(view);
  for (const button of document.querySelectorAll('[data-add]')) {
    button.hidden = !action;
    if (action) {
      button.onclick = action.run;
      if (button.classList.contains('mn-fab')) button.setAttribute('aria-label', action.label);
      else button.querySelector('span').textContent = action.label;
    }
  }
  document.body.classList.toggle('hide-amounts', Boolean(app.settings.hideAmounts));
}

function renderBanner() {
  bannerEl.textContent = '';
  if (!app.online && app.mn)
    void app.mn.offline.pending().then((n) => {
      if (n !== app.pending) {
        app.pending = n;
        renderBanner();
      }
    });
  if (!app.online) {
    bannerEl.append(
      h(
        'div',
        { class: 'mn-banner mn-banner--warn', role: 'status' },
        app.pending ? t('offline.bannerPending', { n: app.pending }) : t('offline.banner'),
      ),
    );
  }
}

export function render() {
  const view = currentView();
  renderShell(view);
  renderBanner();
  toolsEl.textContent = '';
  main.textContent = '';
  if (!loaded) {
    titleEl.textContent = t(`nav.${view}`);
    subEl.textContent = t('common.loading');
    main.append(skeleton(5));
    return;
  }
  if (loadError) {
    titleEl.textContent = t(`nav.${view}`);
    subEl.textContent = '';
    main.append(errorBox(t('common.loadError'), () => start()));
    return;
  }
  const result = VIEWS[view].render(main, params()) ?? {};
  titleEl.textContent = result.title ?? t(`nav.${view}`);
  subEl.textContent = result.subtitle ?? '';
  for (const tool of result.tools ?? []) toolsEl.append(tool);
  if (VIEWS[view].help) toolsEl.append(helpButton(view));
  document.title = `${titleEl.textContent} · ${t('app.title')}`;
}
app.render = render;

for (const tab of document.querySelectorAll('.mn-tab'))
  tab.addEventListener('click', () => app.go(tab.dataset.tab));

// ---------- keyboard ----------
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]'))
    return;
  if (document.querySelector('.mn-overlay')) return;
  const view = currentView();
  if (event.key === 'n') {
    const action = addAction(view);
    if (action) {
      event.preventDefault();
      action.run();
    }
  } else if (event.key === '/') {
    const search = main.querySelector('input[type=search]');
    if (search) {
      event.preventDefault();
      search.focus();
    }
  } else if (event.key === 'j' || event.key === 'k') {
    const rows = [...main.querySelectorAll('.mn-list .mn-row[data-id]')];
    if (!rows.length) return;
    event.preventDefault();
    const at = rows.indexOf(document.activeElement);
    const next = event.key === 'j' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
    rows[at < 0 ? 0 : next].focus();
  } else if (event.key === 'e') {
    const row = document.activeElement?.closest?.('.mn-row[data-id]');
    if (row) {
      event.preventDefault();
      row.click();
    }
  } else if (event.key === '?') {
    event.preventDefault();
    openShortcuts();
  }
});

// ---------- start ----------
async function start() {
  loaded = false;
  loadError = null;
  render();
  try {
    if (!app.store) app.store = createStore(app.mn);
    const [settings, company] = await Promise.all([
      app.mn.kv.get('settings'),
      app.mn.kv.get('company'),
      app.store.load(),
      loadSeen(),
    ]);
    app.settings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
    app.company = { ...DEFAULT_COMPANY, ...(company ?? {}) };
    loaded = true;
  } catch {
    loadError = true;
  }
  render();
  if (!loaded) return;
  // Background work after the first picture.
  void (async () => {
    await purgeOld();
    await remindOverdue();
    await uploadMissingPdfs();
  })();
}

async function boot() {
  await window.mnI18n.ready;
  render();
  app.mn = await window.mininode.mininode();
  await app.mn.auth.requireLogin();
  for (const link of document.querySelectorAll('.mn-home')) link.href = app.mn.config.portalUrl;
  app.online = app.mn.offline.online();
  app.mn.offline.onChange(async (online) => {
    app.online = online;
    app.pending = await app.mn.offline.pending();
    renderBanner();
    if (online) void uploadMissingPdfs();
  });
  app.mn.offline.onSynced(async () => {
    app.pending = 0;
    await app.store.load();
    render();
  });
  window.mnI18n.onChange(() => render());
  if (!app.online) app.pending = await app.mn.offline.pending();
  await start();
}

void boot();
