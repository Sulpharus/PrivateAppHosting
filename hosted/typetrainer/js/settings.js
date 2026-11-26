// "Einstellungen": general settings, categories, data (export, import, delete), account and help.
import { errorBox, route, setHeader } from './app.js';
import { clear, h, icon, skeleton } from './dom.js';
import { LAYOUTS } from './layouts.js';
import {
  between,
  cut,
  deleteEverything,
  removeCategory,
  saveCategory,
  saveSettings,
  saveText,
  state,
  t,
} from './state.js';
import { confirmButton } from './texts.js';

const COLOURS = ['blue', 'green', 'violet', 'amber', 'rose', 'teal', 'gray'];
const main = () => document.getElementById('main');

export function renderSettings() {
  setHeader(t('settings.title'), t('settings.sub'));
  const root = clear(main());
  if (state.loading) return root.append(skeleton(260, 160, 160));
  if (state.error) return root.append(errorBox(t('common.loadError'), () => route()));
  root.append(
    h('div', { class: 'tt-settings' }, general(), categories(), data(), account(), help()),
  );
}

async function apply(patch, toast) {
  try {
    await saveSettings(patch);
    if (toast) window.mnui.toast(toast);
  } catch {
    window.mnui.toast(t('common.saveError'));
  }
}

function seg(label, options, value, onPick) {
  const group = h('div', { class: 'mn-seg', role: 'group', 'aria-label': label });
  for (const [id, text] of options) {
    group.append(
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(id === value),
          onclick: (e) => {
            window.mnui.select(e.currentTarget);
            onPick(id);
          },
        },
        text,
      ),
    );
  }
  return group;
}

function general() {
  const s = state.settings;
  const layout = h(
    'select',
    { id: 'set-layout' },
    LAYOUTS.map((l) => h('option', { value: l.id, selected: l.id === s.layout }, l.name)),
  );
  const layoutHint = h(
    'p',
    { class: 'mn-hint' },
    t(`settings.layoutHint.${LAYOUTS.find((l) => l.id === s.layout)?.family ?? 'classic'}`),
  );
  layout.addEventListener('change', () => {
    const family = LAYOUTS.find((l) => l.id === layout.value)?.family ?? 'classic';
    layoutHint.textContent = t(`settings.layoutHint.${family}`);
    void apply({ layout: layout.value }, t('settings.layoutSaved'));
  });
  const minutes = h('input', {
    id: 'set-minutes',
    type: 'number',
    inputmode: 'numeric',
    min: '1',
    max: '240',
    value: String(s.dailyMinutes),
    'aria-describedby': 'minutes-error',
  });
  const minutesError = h('p', {
    class: 'mn-error',
    id: 'minutes-error',
    role: 'alert',
    hidden: true,
  });
  minutes.addEventListener('change', () => {
    const n = Number.parseInt(minutes.value.replace(/[^\d]/g, ''), 10);
    const ok = Number.isFinite(n) && n >= 1 && n <= 240;
    minutes.setAttribute('aria-invalid', String(!ok));
    minutesError.hidden = ok;
    minutesError.textContent = ok ? '' : t('settings.minutesError');
    if (ok) void apply({ dailyMinutes: n }, t('settings.saved'));
  });
  const keyboard = h('input', { type: 'checkbox', checked: s.keyboard });
  keyboard.addEventListener(
    'change',
    () => void apply({ keyboard: keyboard.checked }, t('settings.saved')),
  );
  return h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'set-general' },
    h('h2', { id: 'set-general' }, t('settings.general')),
    h(
      'div',
      { class: 'mn-form' },
      h('label', { class: 'mn-field', for: 'set-layout' }, t('settings.layout'), layout),
      layoutHint,
      h(
        'div',
        { class: 'mn-field' },
        h('span', {}, t('settings.textLang')),
        seg(
          t('settings.textLang'),
          [
            ['auto', t('settings.langAuto')],
            ['de', 'Deutsch'],
            ['en', 'English'],
          ],
          s.textLang,
          (v) => apply({ textLang: v }, t('settings.saved')),
        ),
      ),
      h(
        'div',
        { class: 'mn-field' },
        h('span', {}, t('settings.errors')),
        seg(
          t('settings.errors'),
          [
            ['stop', t('settings.errorStop')],
            ['continue', t('settings.errorContinue')],
          ],
          s.errorMode,
          (v) => apply({ errorMode: v }, t('settings.saved')),
        ),
      ),
      h('p', { class: 'mn-hint' }, t('settings.errorsHint')),
      h(
        'div',
        { class: 'mn-checks' },
        h('label', {}, keyboard, h('span', {}, t('settings.keyboard'))),
      ),
      h('label', { class: 'mn-field', for: 'set-minutes' }, t('settings.minutes'), minutes),
      minutesError,
    ),
  );
}

// ---------- categories ----------

function categories() {
  const list = state.categories;
  const input = h('input', {
    type: 'text',
    maxlength: '60',
    placeholder: t('categories.newPlaceholder'),
    'aria-label': t('categories.newLabel'),
  });
  const form = h(
    'form',
    { class: 'tt-quick', novalidate: true },
    input,
    h('button', { class: 'mn-btn', type: 'submit' }, t('common.add')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return input.focus();
    try {
      await saveCategory({
        id: state.mn.table('categories').newId(),
        name,
        colour: COLOURS[list.length % COLOURS.length],
        position: between(list.at(-1)?.position ?? null, null),
        archived: false,
      });
      window.mnui.toast(t('categories.added'));
    } catch {
      window.mnui.toast(t('common.saveError'));
    }
    renderSettings();
    document.querySelector('.tt-cats + .tt-quick input, #set-cats ~ .tt-quick input')?.focus();
  });
  const rows = list.map((c, i) => {
    const used = state.texts.some((x) => x.category_id === c.id);
    const name = h('input', {
      type: 'text',
      value: c.name,
      maxlength: '60',
      'aria-label': t('categories.rename', { name: c.name }),
    });
    name.addEventListener('change', async () => {
      const value = name.value.trim();
      if (!value) {
        name.value = c.name;
        return;
      }
      await update({ ...c, name: value }, t('categories.renamed'));
    });
    const colour = h(
      'select',
      { 'aria-label': t('categories.colour', { name: c.name }) },
      COLOURS.map((k) => h('option', { value: k, selected: k === c.colour }, t(`colour.${k}`))),
    );
    colour.addEventListener('change', () => void update({ ...c, colour: colour.value }));
    return h(
      'li',
      { class: `tt-cat${c.archived ? ' is-archived' : ''}` },
      h('span', { class: 'tt-cat-dot', dataset: { cat: c.colour }, 'aria-hidden': 'true' }),
      name,
      colour,
      h(
        'button',
        {
          class: 'mn-icon-btn',
          type: 'button',
          'aria-label': t('categories.up', { name: c.name }),
          disabled: i === 0,
          onclick: () => reorder(c, -1),
        },
        icon('up'),
      ),
      h(
        'button',
        {
          class: 'mn-icon-btn',
          type: 'button',
          'aria-label': t('categories.down', { name: c.name }),
          disabled: i === list.length - 1,
          onclick: () => reorder(c, 1),
        },
        icon('down'),
      ),
      used || c.archived
        ? h(
            'button',
            {
              class: 'mn-btn mn-btn--ghost',
              type: 'button',
              onclick: () =>
                update(
                  { ...c, archived: !c.archived },
                  c.archived ? t('categories.restored') : t('categories.archived'),
                ),
            },
            c.archived ? t('categories.restore') : t('categories.archive'),
          )
        : confirmButton(t('common.delete'), t('common.deleteConfirm'), async () => {
            try {
              await removeCategory(c.id);
              window.mnui.toast(t('categories.deleted'));
            } catch {
              window.mnui.toast(t('common.saveError'));
            }
            renderSettings();
          }),
    );
  });
  return h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'set-cats' },
    h('h2', { id: 'set-cats' }, t('categories.title')),
    h('p', { class: 'mn-hint' }, t('categories.hint')),
    rows.length
      ? h('ul', { class: 'tt-cats' }, rows)
      : h('p', { class: 'mn-note' }, t('categories.empty')),
    form,
  );
}

async function update(row, toast) {
  try {
    await saveCategory(row);
    if (toast) window.mnui.toast(toast);
  } catch {
    window.mnui.toast(t('common.saveError'));
  }
  renderSettings();
}

async function reorder(c, step) {
  const list = state.categories;
  const i = list.findIndex((x) => x.id === c.id);
  const others = list.filter((x) => x.id !== c.id);
  const j = i + step;
  await update({
    ...c,
    position: between(others[j - 1]?.position ?? null, others[j]?.position ?? null),
  });
}

// ---------- data ----------

function csvCell(value) {
  const s = String(value ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Parses semicolon-separated CSV with quoted cells (which may hold line breaks). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function data() {
  const exportSessions = () => {
    const head = [
      'date',
      'mode',
      'course',
      'level',
      'layout',
      'difficulty',
      'wpm',
      'accuracy',
      'chars',
      'errors',
      'seconds',
    ];
    const lines = state.sessions.map((s) =>
      [
        s.practised_on,
        s.mode,
        s.course,
        s.level ?? '',
        s.layout,
        s.difficulty ?? '',
        s.wpm,
        s.accuracy,
        s.chars,
        s.errors,
        Math.round(s.duration_ms / 1000),
      ]
        .map(csvCell)
        .join(';'),
    );
    download('typetrainer-runs.csv', [head.join(';'), ...lines].join('\n'));
    window.mnui.toast(t('data.exported'));
  };
  const exportTexts = () => {
    const lines = state.texts.map((x) => [x.title, x.body].map(csvCell).join(';'));
    download('typetrainer-texts.csv', lines.join('\n'));
    window.mnui.toast(t('data.exported'));
  };
  const file = h('input', {
    type: 'file',
    accept: '.csv,.txt,text/csv,text/plain',
    class: 'mn-sr-only',
    id: 'import-file',
  });
  const importError = h('p', { class: 'mn-error', role: 'alert', hidden: true });
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    importError.hidden = true;
    try {
      const rows = parseCsv(await chosen.text())
        .map(([title = '', body = '']) => [cut(title.trim(), 120), cut(body.trim(), 5000)])
        .filter(([title, body]) => title && body);
      if (!rows.length) throw new Error('empty');
      let last = state.texts.at(-1)?.position ?? null;
      for (const [title, body] of rows) {
        last = between(last, null);
        await saveText({
          id: state.mn.table('texts').newId(),
          title,
          body,
          kind: 'text',
          code_language: null,
          category_id: null,
          position: last,
          mastered: false,
        });
      }
      window.mnui.toast(t('data.imported', { n: rows.length }));
    } catch (error) {
      importError.hidden = false;
      importError.textContent =
        error?.message === 'empty' ? t('data.importEmpty') : t('common.saveError');
    }
  });

  const word = t('data.deleteWord');
  const confirmInput = h('input', {
    type: 'text',
    autocomplete: 'off',
    'aria-describedby': 'delete-hint',
  });
  const deleteButton = h(
    'button',
    { class: 'mn-btn mn-btn--danger', type: 'button', disabled: true },
    t('data.deleteAll'),
  );
  confirmInput.addEventListener('input', () => {
    deleteButton.disabled = confirmInput.value.trim().toLocaleLowerCase() !== word;
  });
  deleteButton.addEventListener('click', async () => {
    deleteButton.disabled = true;
    try {
      await deleteEverything();
      window.mnui.toast(t('data.deleted'));
      location.hash = '#/';
    } catch {
      window.mnui.toast(t('common.saveError'));
      // Show what is left; the rows already deleted are gone from the lists too.
      renderSettings();
    }
  });

  return h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'set-data' },
    h('h2', { id: 'set-data' }, t('data.title')),
    h('p', { class: 'mn-hint' }, t('data.hint')),
    h(
      'div',
      { class: 'tt-actions tt-actions--start' },
      h(
        'button',
        {
          class: 'mn-btn',
          type: 'button',
          disabled: !state.sessions.length,
          onclick: exportSessions,
        },
        t('data.exportRuns'),
      ),
      h(
        'button',
        { class: 'mn-btn', type: 'button', disabled: !state.texts.length, onclick: exportTexts },
        t('data.exportTexts'),
      ),
      h('label', { class: 'mn-btn', for: 'import-file' }, t('data.importTexts')),
      file,
    ),
    importError,
    h(
      'details',
      { class: 'mn-more' },
      h('summary', {}, t('data.deleteSummary')),
      h(
        'div',
        { class: 'mn-form' },
        h('p', { class: 'mn-hint', id: 'delete-hint' }, t('data.deleteHint', { word })),
        h('label', { class: 'mn-field' }, t('data.deleteLabel', { word }), confirmInput),
        deleteButton,
      ),
    ),
  );
}

function account() {
  return h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'set-account' },
    h('h2', { id: 'set-account' }, t('account.title')),
    h('p', { class: 'mn-hint' }, t('account.hint')),
    h(
      'div',
      { class: 'tt-actions tt-actions--start' },
      h('a', { class: 'mn-btn', href: state.mn.auth.accountUrl() }, t('account.open')),
      h(
        'button',
        {
          class: 'mn-btn mn-btn--ghost',
          type: 'button',
          onclick: () => void state.mn.auth.signOut(),
        },
        t('account.signOut'),
      ),
    ),
  );
}

function help() {
  return h(
    'section',
    { class: 'mn-card', 'aria-labelledby': 'set-help' },
    h('h2', { id: 'set-help' }, t('help.title')),
    h('p', {}, t('help.layouts')),
    h('p', {}, t('help.wpm')),
    h('p', {}, t('help.stars')),
    h(
      'div',
      { class: 'tt-actions tt-actions--start' },
      h(
        'button',
        { class: 'mn-btn', type: 'button', onclick: () => showShortcuts() },
        t('help.shortcuts'),
      ),
    ),
  );
}

/** The "Tastenkürzel" sheet (also on "?"). */
export function showShortcuts() {
  const rows = [
    ['n', t('shortcuts.lesson')],
    ['p', t('shortcuts.practice')],
    ['d', t('shortcuts.daily')],
    ['Esc', t('shortcuts.cancel')],
    ['Enter', t('shortcuts.next')],
    ['/', t('shortcuts.search')],
    ['j / k', t('shortcuts.move')],
    ['e', t('shortcuts.edit')],
    ['n', t('shortcuts.newText')],
    ['?', t('shortcuts.help')],
  ];
  const content = h(
    'div',
    {},
    h(
      'div',
      { class: 'mn-sheet-bar' },
      h(
        'button',
        {
          class: 'mn-icon-btn',
          type: 'button',
          'data-mn-close': true,
          'aria-label': t('common.close'),
        },
        icon('close'),
      ),
      h('h2', {}, t('shortcuts.title')),
      h('span', {}),
    ),
    h(
      'div',
      { class: 'mn-sheet-body' },
      h('p', { class: 'mn-hint' }, t('shortcuts.hint')),
      h(
        'dl',
        { class: 'mn-facts' },
        rows.map(([key, text]) => h('div', {}, h('dt', {}, h('kbd', {}, key)), h('dd', {}, text))),
      ),
    ),
  );
  window.mnui.sheet.open(content);
}
