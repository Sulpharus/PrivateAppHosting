// "Texte": the person's own practice texts with categories, manual order, a done section
// ("Gemeistert"), multi-select, a detail sheet and an editor (optionally with an AI suggestion).
import { errorBox, route, setHeader } from './app.js';
import { CODE_LANGUAGES, getCodeLanguage } from './code.js';
import { clear, fill, h, icon, skeleton } from './dom.js';
import { adapt } from './generator.js';
import { getLayout } from './layouts.js';
import { startRun } from './run.js';
import { between, cut, removeText, saveText, state, t, textLang } from './state.js';

const ui = { category: 'all', query: '', selecting: false, selected: new Set(), anchor: null };

const main = () => document.getElementById('main');

function visible(list) {
  const q = ui.query.trim().toLocaleLowerCase();
  return list.filter(
    (x) =>
      (ui.category === 'all' || x.category_id === ui.category) &&
      (!q || x.title.toLocaleLowerCase().includes(q) || x.body.toLocaleLowerCase().includes(q)),
  );
}

const categoryOf = (text) => state.categories.find((c) => c.id === text.category_id) ?? null;

function subline(text) {
  const parts = [];
  const cat = categoryOf(text);
  if (cat) parts.push(cat.name);
  parts.push(text.kind === 'code' ? getCodeLanguage(text.code_language).name : t('texts.prose'));
  parts.push(t('texts.chars', { n: text.body.length }));
  return parts.join(' · ');
}

export function renderTexts(openId) {
  const open = state.texts.filter((x) => !x.mastered);
  const done = state.texts.filter((x) => x.mastered);
  const addButton = h(
    'button',
    {
      class: 'mn-fab tt-corner',
      type: 'button',
      'aria-label': t('texts.add'),
      title: t('texts.addHint'),
      onclick: () => openEditor(null),
    },
    icon('plus'),
  );
  // The kit hides the round button from 960 px: there the add button sits in the tools.
  const addDesk = h(
    'button',
    {
      class: 'mn-btn mn-btn--primary tt-desk',
      type: 'button',
      title: t('texts.addHint'),
      onclick: () => openEditor(null),
    },
    t('texts.add'),
  );
  const selectButton = h(
    'button',
    {
      class: 'mn-btn mn-btn--ghost',
      type: 'button',
      'aria-pressed': String(ui.selecting),
      onclick: () => toggleSelecting(),
    },
    ui.selecting ? t('texts.selectDone') : t('texts.select'),
  );
  setHeader(
    t('texts.title'),
    t('texts.count', { n: state.texts.length }),
    state.texts.length ? [selectButton, addDesk] : [addDesk],
    addButton,
  );
  const root = clear(main());
  if (state.loading) return root.append(skeleton(48, 44, 64, 64, 64));
  if (state.error) return root.append(errorBox(t('common.loadError'), () => route()));

  root.append(quickAdd());
  if (state.texts.length === 0) {
    root.append(
      h(
        'div',
        { class: 'mn-empty' },
        h('div', { class: 'mn-empty-icon' }, icon('text')),
        h('h3', {}, t('texts.emptyTitle')),
        h('p', {}, t('texts.emptyText')),
        h(
          'button',
          { class: 'mn-btn mn-btn--primary', type: 'button', onclick: () => openEditor(null) },
          t('texts.add'),
        ),
      ),
    );
    return;
  }

  const search = h('input', {
    type: 'search',
    value: ui.query,
    placeholder: t('texts.search'),
    'aria-label': t('texts.searchLabel'),
    title: t('texts.searchHint'),
    id: 'text-search',
  });
  search.addEventListener('input', () => {
    ui.query = search.value;
    renderLists(listsWrap, open, done);
  });
  const cats = state.categories.filter((c) => !c.archived);
  const chips = cats.length
    ? h(
        'div',
        { class: 'mn-chips', role: 'group', 'aria-label': t('texts.categories') },
        [{ id: 'all', name: t('texts.all') }, ...cats].map((c) =>
          h(
            'button',
            {
              class: 'mn-filter',
              type: 'button',
              'aria-pressed': String(ui.category === c.id),
              dataset: c.colour ? { cat: c.colour } : {},
              onclick: () => {
                ui.category = c.id;
                renderTexts();
              },
            },
            c.name,
          ),
        ),
      )
    : null;
  const listsWrap = h('div', { class: 'tt-lists' });
  root.append(
    ...[h('div', { class: 'mn-search' }, icon('search'), search), chips, listsWrap].filter(Boolean),
  );
  renderLists(listsWrap, open, done);
  if (ui.selecting) root.append(selectionBar());
  if (openId) {
    const text = state.texts.find((x) => x.id === openId);
    if (text) openDetail(text);
  }
}

function renderLists(wrap, open, done) {
  const shown = visible(open);
  const doneShown = visible(done);
  fill(
    wrap,
    h(
      'div',
      { class: 'mn-sect' },
      h('h2', {}, t('texts.open'), h('small', {}, String(shown.length))),
    ),
    shown.length
      ? list(shown)
      : h('p', { class: 'mn-note' }, ui.query ? t('texts.noMatch') : t('texts.allMastered')),
    done.length
      ? h(
          'details',
          { class: 'tt-done' },
          h('summary', {}, t('texts.mastered', { n: done.length })),
          list(doneShown),
          h(
            'div',
            { class: 'tt-actions' },
            confirmButton(t('texts.clearMastered'), t('texts.clearMasteredConfirm'), () =>
              clearMastered(),
            ),
          ),
        )
      : null,
  );
}

function list(items) {
  const desktop = window.matchMedia('(pointer: fine)').matches;
  return h(
    'div',
    { class: 'mn-list tt-items' },
    items.map((text) => {
      const selected = ui.selected.has(text.id);
      const lead = ui.selecting
        ? h(
            'button',
            {
              class: 'tt-check tt-select',
              type: 'button',
              'aria-pressed': String(selected),
              'aria-label': t('texts.selectItem', { title: text.title }),
              onclick: (e) => toggleSelect(text, e.shiftKey, items),
            },
            icon('check'),
          )
        : h(
            'button',
            {
              class: 'tt-check',
              type: 'button',
              'aria-pressed': String(Boolean(text.mastered)),
              'aria-label': text.mastered
                ? t('texts.unmaster', { title: text.title })
                : t('texts.master', { title: text.title }),
              onclick: () => toggleMastered(text),
            },
            icon('check'),
          );
      const row = h(
        'button',
        {
          class: 'mn-row tt-row',
          type: 'button',
          dataset: { id: text.id },
          onclick: (e) => (ui.selecting ? toggleSelect(text, e.shiftKey, items) : openDetail(text)),
        },
        h(
          'span',
          {},
          h('span', { class: 'mn-row-title' }, text.title),
          h('span', { class: 'mn-row-sub' }, subline(text)),
        ),
        h('span', { class: 'mn-row-side' }, icon('chevron')),
      );
      const item = h(
        'div',
        {
          class: `tt-item${text.mastered ? ' is-done' : ''}${selected ? ' is-selected' : ''}`,
          dataset: { id: text.id },
        },
        lead,
        row,
      );
      if (desktop && !text.mastered && !ui.selecting) makeDraggable(item, text);
      return item;
    }),
  );
}

// ---------- quick add ----------

function quickAdd() {
  const input = h('input', {
    type: 'text',
    placeholder: t('texts.quickAdd'),
    'aria-label': t('texts.quickAddLabel'),
    maxlength: '5000',
    enterkeyhint: 'done',
  });
  const form = h(
    'form',
    { class: 'tt-quick', novalidate: true },
    input,
    h('button', { class: 'mn-btn', type: 'submit' }, t('common.add')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return input.focus();
    const words = body.split(/\s+/).slice(0, 6).join(' ');
    const title = Array.from(words).length > 60 ? `${cut(words, 59)}…` : words;
    const last = state.texts.filter((x) => !x.mastered).at(-1);
    try {
      await saveText({
        id: state.mn.table('texts').newId(),
        title,
        body: cut(body, 5000),
        kind: 'text',
        code_language: null,
        category_id: ui.category === 'all' ? null : ui.category,
        position: between(last?.position ?? null, null),
        mastered: false,
      });
      window.mnui.toast(t('texts.saved'));
      renderTexts();
      document.querySelector('.tt-quick input')?.focus();
    } catch {
      window.mnui.toast(t('common.saveError'));
    }
  });
  return form;
}

// ---------- mastered, order, selection ----------

async function toggleMastered(text) {
  try {
    await saveText({ ...text, mastered: !text.mastered });
    window.mnui.toast(text.mastered ? t('texts.masteredToast') : t('texts.reopenedToast'));
  } catch {
    window.mnui.toast(t('common.saveError'));
  }
  renderTexts();
}

async function clearMastered() {
  try {
    for (const text of state.texts.filter((x) => x.mastered)) await removeText(text.id);
    window.mnui.toast(t('texts.clearedToast'));
  } catch {
    window.mnui.toast(t('common.saveError'));
  }
  renderTexts();
}

/** Moves a text one place up or down among the open texts (writes one row). */
export async function move(text, step) {
  const open = state.texts.filter((x) => !x.mastered);
  const i = open.findIndex((x) => x.id === text.id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= open.length) return;
  const others = open.filter((x) => x.id !== text.id);
  const before = others[j - 1]?.position ?? null;
  const after = others[j]?.position ?? null;
  await saveText({ ...text, position: between(before, after) });
}

function makeDraggable(item, text) {
  item.draggable = true;
  item.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', text.id);
    e.dataTransfer.effectAllowed = 'move';
    item.classList.add('is-dragging');
  });
  item.addEventListener('dragend', () => item.classList.remove('is-dragging'));
  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    item.classList.add('is-over');
  });
  item.addEventListener('dragleave', () => item.classList.remove('is-over'));
  item.addEventListener('drop', async (e) => {
    e.preventDefault();
    item.classList.remove('is-over');
    const id = e.dataTransfer.getData('text/plain');
    const moving = state.texts.find((x) => x.id === id);
    if (!moving || moving.id === text.id) return;
    const open = state.texts.filter((x) => !x.mastered && x.id !== id);
    const i = open.findIndex((x) => x.id === text.id);
    try {
      await saveText({
        ...moving,
        position: between(open[i - 1]?.position ?? null, text.position),
      });
      window.mnui.toast(t('texts.movedToast'));
    } catch {
      window.mnui.toast(t('common.saveError'));
    }
    renderTexts();
  });
}

function toggleSelecting() {
  ui.selecting = !ui.selecting;
  ui.selected.clear();
  ui.anchor = null;
  renderTexts();
}

function toggleSelect(text, range, items) {
  if (range && ui.anchor) {
    const a = items.findIndex((x) => x.id === ui.anchor);
    const b = items.findIndex((x) => x.id === text.id);
    if (a >= 0 && b >= 0)
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) ui.selected.add(items[i].id);
  } else if (ui.selected.has(text.id)) ui.selected.delete(text.id);
  else ui.selected.add(text.id);
  ui.anchor = text.id;
  renderTexts();
  document.querySelector(`.tt-item[data-id="${text.id}"] .tt-select`)?.focus();
}

function selectionBar() {
  const ids = [...ui.selected];
  const select = h(
    'select',
    { 'aria-label': t('texts.moveTo'), disabled: ids.length === 0 },
    h('option', { value: '' }, t('texts.moveTo')),
    h('option', { value: 'none' }, t('texts.noCategory')),
    state.categories.filter((c) => !c.archived).map((c) => h('option', { value: c.id }, c.name)),
  );
  select.addEventListener('change', async () => {
    if (!select.value) return;
    const category = select.value === 'none' ? null : select.value;
    try {
      for (const id of ids) {
        const text = state.texts.find((x) => x.id === id);
        if (text) await saveText({ ...text, category_id: category });
      }
      window.mnui.toast(t('texts.movedMany', { n: ids.length }));
    } catch {
      window.mnui.toast(t('common.saveError'));
    }
    ui.selected.clear();
    renderTexts();
  });
  return h(
    'div',
    { class: 'tt-selbar', role: 'region', 'aria-label': t('texts.selection') },
    h('b', {}, t('texts.selected', { n: ids.length })),
    select,
    ids.length
      ? confirmButton(t('common.delete'), t('common.deleteConfirm'), async () => {
          try {
            for (const id of ids) await removeText(id);
            window.mnui.toast(t('texts.deletedMany', { n: ids.length }));
          } catch {
            window.mnui.toast(t('common.saveError'));
          }
          ui.selected.clear();
          renderTexts();
        })
      : null,
    h(
      'button',
      { class: 'mn-btn mn-btn--ghost', type: 'button', onclick: () => toggleSelecting() },
      t('common.done'),
    ),
  );
}

/** A destructive button that asks for a second tap. */
export function confirmButton(label, confirmLabel, action) {
  let armed = false;
  let timer = 0;
  const button = h('button', { class: 'mn-btn mn-btn--danger', type: 'button' }, label);
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      timer = window.setTimeout(() => {
        armed = false;
        button.textContent = label;
      }, 4000);
      return;
    }
    window.clearTimeout(timer);
    void action();
  });
  return button;
}

// ---------- practice ----------

function practise(text) {
  const layout = getLayout(state.settings.layout);
  window.mnui.sheet.close();
  startRun({
    mode: 'text',
    course: text.kind === 'code' ? 'code' : 'text',
    code: text.kind === 'code',
    textId: text.id,
    title: text.title,
    subtitle: t('run.ownText', { layout: layout.name }),
    text: adapt(text.body, layout),
    onAgain: () => practise(text),
    onExit: () => route(),
  });
}

// ---------- detail ----------

function openDetail(text) {
  const best = state.sessions
    .filter((s) => s.details?.textId === text.id)
    .reduce((max, s) => Math.max(max, Number(s.wpm)), 0);
  const nf = new Intl.NumberFormat(window.mnI18n.locale, { maximumFractionDigits: 0 });
  const cat = categoryOf(text);
  const open = state.texts.filter((x) => !x.mastered);
  const i = open.findIndex((x) => x.id === text.id);
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
      h('span', {}),
      h(
        'button',
        { class: 'mn-btn mn-btn--ghost', type: 'button', onclick: () => openEditor(text) },
        t('common.edit'),
      ),
    ),
    h(
      'div',
      { class: 'mn-sheet-body' },
      h('h2', { class: 'mn-sheet-title' }, text.title),
      h(
        'div',
        { class: 'mn-chips' },
        cat
          ? h('span', { class: 'mn-chip mn-chip--plain', dataset: { cat: cat.colour } }, cat.name)
          : null,
        h(
          'span',
          { class: 'mn-chip mn-chip--plain' },
          text.kind === 'code' ? getCodeLanguage(text.code_language).name : t('texts.prose'),
        ),
        text.mastered
          ? h('span', { class: 'mn-chip mn-chip--ok' }, icon('check'), t('texts.isMastered'))
          : null,
      ),
      h(
        'dl',
        { class: 'mn-facts' },
        h(
          'div',
          {},
          h('dt', {}, t('texts.length')),
          h('dd', {}, t('texts.chars', { n: text.body.length })),
        ),
        h(
          'div',
          {},
          h('dt', {}, t('texts.best')),
          h('dd', {}, best ? t('texts.bestValue', { wpm: nf.format(best) }) : t('texts.notYet')),
        ),
      ),
      h(
        'pre',
        { class: `tt-preview${text.kind === 'code' ? ' tt-preview--code' : ''}` },
        text.body,
      ),
      h(
        'button',
        {
          class: 'mn-btn mn-btn--primary mn-btn--block',
          type: 'button',
          onclick: () => practise(text),
        },
        icon('play', { filled: true }),
        t('texts.practise'),
      ),
      !text.mastered
        ? h(
            'div',
            { class: 'tt-actions' },
            h(
              'button',
              {
                class: 'mn-btn',
                type: 'button',
                disabled: i <= 0,
                onclick: () => moveAndReopen(text, -1),
              },
              icon('up'),
              t('texts.up'),
            ),
            h(
              'button',
              {
                class: 'mn-btn',
                type: 'button',
                disabled: i < 0 || i >= open.length - 1,
                onclick: () => moveAndReopen(text, 1),
              },
              icon('down'),
              t('texts.down'),
            ),
          )
        : null,
      h(
        'div',
        { class: 'tt-actions tt-actions--start' },
        confirmButton(t('common.delete'), t('common.deleteConfirm'), async () => {
          try {
            await removeText(text.id);
            window.mnui.sheet.close();
            window.mnui.toast(t('texts.deleted'));
          } catch {
            window.mnui.toast(t('common.saveError'));
          }
          renderTexts();
        }),
      ),
    ),
  );
  window.mnui.sheet.open(content);
}

async function moveAndReopen(text, step) {
  try {
    await move(text, step);
    window.mnui.toast(t('texts.movedToast'));
  } catch {
    window.mnui.toast(t('common.saveError'));
  }
  renderTexts();
  const fresh = state.texts.find((x) => x.id === text.id);
  if (fresh) openDetail(fresh);
}

// ---------- editor ----------

const DRAFT = 'draft:text';

async function openEditor(text) {
  const isNew = !text;
  const values = text
    ? { ...text }
    : {
        id: state.mn.table('texts').newId(),
        title: '',
        body: '',
        kind: 'text',
        code_language: 'python',
        category_id: ui.category === 'all' ? null : ui.category,
        mastered: false,
      };
  let restored = false;
  if (isNew) {
    try {
      const draft = await state.mn.kv.get(DRAFT);
      if (draft && typeof draft === 'object' && (draft.title || draft.body)) {
        Object.assign(values, {
          title: String(draft.title ?? ''),
          body: String(draft.body ?? ''),
          kind: draft.kind === 'code' ? 'code' : 'text',
          code_language: draft.code_language ?? 'python',
          category_id: draft.category_id ?? null,
        });
        restored = true;
      }
    } catch {
      // No draft offline: start empty.
    }
  }

  const title = h('input', {
    name: 'title',
    value: values.title,
    maxlength: '120',
    required: true,
    autocomplete: 'off',
    'aria-describedby': 'title-error',
  });
  const titleError = h('p', { class: 'mn-error', id: 'title-error', role: 'alert', hidden: true });
  const body = h('textarea', {
    name: 'body',
    rows: '8',
    maxlength: '5000',
    required: true,
    spellcheck: 'false',
    'aria-describedby': 'body-error body-hint',
  });
  body.value = values.body;
  const bodyError = h('p', { class: 'mn-error', id: 'body-error', role: 'alert', hidden: true });
  let kind = values.kind;
  const kindSeg = h(
    'div',
    { class: 'mn-seg', role: 'group', 'aria-label': t('editor.kind') },
    ['text', 'code'].map((k) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(k === kind),
          onclick: (e) => setKind(k, e.currentTarget),
        },
        k === 'code' ? t('practice.code') : t('practice.text'),
      ),
    ),
  );
  const language = h(
    'select',
    { name: 'code_language' },
    CODE_LANGUAGES.map((c) =>
      h('option', { value: c.id, selected: c.id === values.code_language }, c.name),
    ),
  );
  const languageField = h(
    'label',
    { class: 'mn-field', hidden: kind !== 'code' },
    t('editor.language'),
    language,
  );
  const category = h(
    'select',
    { name: 'category_id' },
    h('option', { value: '' }, t('texts.noCategory')),
    state.categories
      .filter((c) => !c.archived || c.id === values.category_id)
      .map((c) => h('option', { value: c.id, selected: c.id === values.category_id }, c.name)),
  );
  const aiChip = h('span', { class: 'mn-chip mn-chip--plain', hidden: true }, t('editor.aiChip'));
  const banner = h(
    'div',
    { class: 'mn-banner mn-banner--warn', role: 'note', hidden: !restored },
    h('span', {}, t('editor.draftRestored')),
    ' ',
    h(
      'button',
      { class: 'mn-link', type: 'button', onclick: () => discardDraft() },
      t('editor.discardDraft'),
    ),
  );
  const confirmBox = h(
    'div',
    { class: 'mn-banner mn-banner--warn tt-confirm', role: 'alert', hidden: true },
    h('span', {}, t('editor.discardQuestion')),
    h(
      'button',
      { class: 'mn-btn mn-btn--danger', type: 'button', onclick: () => close(true) },
      t('editor.discard'),
    ),
    h(
      'button',
      { class: 'mn-btn mn-btn--ghost', type: 'button', onclick: () => (confirmBox.hidden = true) },
      t('editor.keepEditing'),
    ),
  );

  // AI suggestion: only on a button press, cancellable, marked until saved.
  const topic = h('input', {
    type: 'text',
    maxlength: '120',
    placeholder: t('editor.aiTopicPlaceholder'),
    'aria-label': t('editor.aiTopic'),
  });
  const aiError = h('p', { class: 'mn-error', role: 'alert', hidden: true });
  const aiBusy = h('span', { class: 'mn-sk tt-ai-sk', hidden: true, 'aria-hidden': 'true' });
  const aiButton = h(
    'button',
    { class: 'mn-btn', type: 'button', onclick: () => suggest() },
    t('editor.aiButton'),
  );
  const aiCancel = h(
    'button',
    {
      class: 'mn-btn mn-btn--ghost',
      type: 'button',
      hidden: true,
      onclick: () => controller?.abort(),
    },
    t('common.cancel'),
  );
  let controller = null;

  const save = h('button', { class: 'mn-btn mn-btn--primary', type: 'submit' }, t('common.save'));
  const form = h(
    'form',
    { class: 'mn-form', novalidate: true },
    banner,
    confirmBox,
    h(
      'fieldset',
      {},
      h('legend', {}, t('editor.legend')),
      h('label', { class: 'mn-field' }, t('editor.title'), title),
      titleError,
      kindSeg,
      h(
        'div',
        { class: 'mn-grid-2' },
        languageField,
        h('label', { class: 'mn-field' }, t('editor.category'), category),
      ),
      h('label', { class: 'mn-field' }, h('span', {}, t('editor.body'), ' ', aiChip), body),
      h('p', { class: 'mn-hint', id: 'body-hint' }, t('editor.bodyHint')),
      bodyError,
    ),
    h(
      'details',
      { class: 'mn-more' },
      h('summary', {}, t('editor.aiSummary')),
      h(
        'div',
        {},
        h('p', { class: 'mn-hint' }, t('editor.aiHint')),
        h('label', { class: 'mn-field' }, t('editor.aiTopic'), topic),
        aiBusy,
        aiError,
        h('div', { class: 'tt-actions tt-actions--start' }, aiButton, aiCancel),
      ),
    ),
  );
  const content = h(
    'div',
    {},
    h(
      'div',
      { class: 'mn-sheet-bar' },
      h(
        'button',
        { class: 'mn-btn mn-btn--ghost', type: 'button', onclick: () => close(false) },
        t('common.cancel'),
      ),
      h('h2', {}, isNew ? t('editor.newTitle') : t('editor.editTitle')),
      h('span', {}),
    ),
    h('div', { class: 'mn-sheet-body' }, form),
    h('div', { class: 'mn-sheet-foot' }, h('span', { class: 'mn-grow' }), save),
  );
  save.setAttribute('form', 'text-form');
  form.id = 'text-form';

  const snapshot = () =>
    JSON.stringify([title.value, body.value, kind, language.value, category.value]);
  const initial = restored ? '' : snapshot();
  const dirty = () => snapshot() !== initial;
  const touched = new Set();

  function setKind(k, button) {
    kind = k;
    window.mnui.select(button);
    languageField.hidden = k !== 'code';
  }

  function validate(fields = ['title', 'body']) {
    let first = null;
    if (fields.includes('title')) {
      const ok = title.value.trim().length > 0;
      title.setAttribute('aria-invalid', String(!ok));
      titleError.hidden = ok;
      titleError.textContent = ok ? '' : t('editor.titleMissing');
      if (!ok) first ??= title;
    }
    if (fields.includes('body')) {
      const ok = body.value.trim().length > 0;
      body.setAttribute('aria-invalid', String(!ok));
      bodyError.hidden = ok;
      bodyError.textContent = ok ? '' : t('editor.bodyMissing');
      if (!ok) first ??= body;
    }
    return first;
  }
  for (const [name, el] of [
    ['title', title],
    ['body', body],
  ]) {
    el.addEventListener('input', () => touched.add(name));
    el.addEventListener('blur', () => touched.has(name) && validate([name]));
  }
  body.addEventListener('input', () => (aiChip.hidden = true));

  let draftTimer = 0;
  if (isNew) {
    draftTimer = window.setInterval(() => {
      if (!dirty()) return;
      void state.mn.kv
        .set(DRAFT, {
          title: title.value,
          body: body.value,
          kind,
          code_language: language.value,
          category_id: category.value || null,
        })
        .catch(() => {});
    }, 3000);
  }
  async function discardDraft() {
    banner.hidden = true;
    title.value = '';
    body.value = '';
    try {
      await state.mn.kv.delete(DRAFT);
    } catch {
      // Removed next time online.
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invalid = validate();
    if (invalid) return invalid.focus();
    save.disabled = true;
    save.classList.add('is-busy');
    const last = state.texts.filter((x) => !x.mastered).at(-1);
    try {
      await saveText({
        ...values,
        title: title.value.trim(),
        body: body.value.replace(/\s+$/, ''),
        kind,
        code_language: kind === 'code' ? language.value : null,
        category_id: category.value || null,
        position: isNew ? between(last?.position ?? null, null) : values.position,
      });
      if (isNew) await state.mn.kv.delete(DRAFT).catch(() => {});
      window.clearInterval(draftTimer);
      window.mnui.sheet.close();
      window.mnui.toast(t('texts.saved'));
      renderTexts();
    } catch {
      save.disabled = false;
      save.classList.remove('is-busy');
      bodyError.hidden = false;
      bodyError.textContent = t('common.saveError');
    }
  });

  async function suggest() {
    aiError.hidden = true;
    controller = new AbortController();
    aiBusy.hidden = false;
    aiCancel.hidden = false;
    aiButton.disabled = true;
    const subject = topic.value.trim() || t('editor.aiDefaultTopic');
    const answerIn = textLang() === 'en' ? 'Answer in English.' : 'Antworte auf Deutsch.';
    const prompt =
      kind === 'code'
        ? `Write a short, realistic ${getCodeLanguage(language.value).name} code snippet (10 to 16 lines) about: ${subject}. Plain code only, no Markdown fences, no explanation, spaces for indentation. Comments: ${answerIn}`
        : `Write a practice text for touch typing about: ${subject}. About 80 words, plain prose in full sentences, normal punctuation, no lists, no headings, no Markdown. ${answerIn}`;
    try {
      const answer = await state.mn.ai.chat(prompt, {
        model: 'gemini-flash',
        signal: controller.signal,
      });
      const clean = cut(
        String(answer ?? '')
          .replace(/^```\w*\n?|```$/g, '')
          .trim(),
        5000,
      );
      if (clean) {
        body.value = clean;
        aiChip.hidden = false;
        if (!title.value.trim()) title.value = cut(subject, 120);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        aiError.hidden = false;
        aiError.textContent = error?.code === 'budget_exceeded' ? t('ai.budget') : t('ai.failed');
      }
    } finally {
      controller = null;
      aiBusy.hidden = true;
      aiCancel.hidden = true;
      aiButton.disabled = false;
    }
  }

  function close(force) {
    if (!force && dirty()) {
      confirmBox.hidden = false;
      confirmBox.querySelector('button')?.focus();
      return;
    }
    window.clearInterval(draftTimer);
    controller?.abort();
    if (force && isNew) void state.mn.kv.delete(DRAFT).catch(() => {});
    window.mnui.sheet.close();
  }

  const sheet = window.mnui.sheet.open(content, {
    tall: true,
    modal: true,
    onClose: () => window.clearInterval(draftTimer),
  });
  // Escape asks first when something changed.
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dirty()) {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    }
  });
  title.focus();
}

// ---------- keyboard ----------

/** Shortcuts of this view: n new, / search, j/k next/previous, e edit. Returns true when handled. */
export function textShortcut(e) {
  if (e.key === 'n') {
    void openEditor(null);
    return true;
  }
  if (e.key === '/') {
    document.getElementById('text-search')?.focus();
    return true;
  }
  const rows = [...document.querySelectorAll('.tt-row')];
  if (!rows.length) return false;
  const i = rows.indexOf(document.activeElement);
  if (e.key === 'j' || e.key === 'k') {
    const next = e.key === 'j' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
    rows[i < 0 ? 0 : next].focus();
    return true;
  }
  if (e.key === 'e' && i >= 0) {
    const text = state.texts.find((x) => x.id === rows[i].dataset.id);
    if (text) void openEditor(text);
    return true;
  }
  return false;
}
