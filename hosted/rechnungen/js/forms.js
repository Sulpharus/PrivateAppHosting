// Form building blocks for the editor sheets: inputs, the sheet frame with unsaved-changes guard,
// kv drafts, amount fields that say what they understood, and the Markdown text field.
import { app } from './ctx.js';
import { field, h, locale, money, t } from './dom.js';
import { mdToDom } from './md.js';
import { parseCents } from './money.js';

export function input(attrs = {}) {
  return h('input', { type: 'text', autocomplete: 'off', ...attrs });
}

export function select(options, value, attrs = {}) {
  return h(
    'select',
    attrs,
    options.map((o) =>
      h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label),
    ),
  );
}

/** An amount field: accepts "1.234,50" and "1,234.50" and shows what it read. */
export function amountField(label, cents, { required, hint } = {}) {
  const el = input({
    inputmode: 'decimal',
    value:
      cents === null || cents === undefined
        ? ''
        : new Intl.NumberFormat(locale(), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(cents / 100),
  });
  const understood = h('p', { class: 'mn-hint', 'aria-live': 'polite' }, hint ?? '');
  const box = field(label, el, { required });
  box.append(understood);
  const show = () => {
    const value = parseCents(el.value);
    understood.textContent =
      el.value.trim() && value !== null
        ? t('form.understood', { value: money(value) })
        : (hint ?? '');
  };
  el.addEventListener('input', show);
  box.read = () => (el.value.trim() ? parseCents(el.value) : null);
  box.input = el;
  return box;
}

/** A Markdown text area with a small toolbar (fett, Liste, Checkliste, Link) and a preview. */
export function markdownField(label, value, { rows = 4, max = 4000, hint } = {}) {
  const area = h('textarea', { rows, maxlength: max }, value ?? '');
  const preview = h('div', { class: 'mdpreview', hidden: true });
  const counter = h('span', { class: 'mn-hint' });
  const updateCount = () => {
    counter.textContent = t('form.chars', { n: area.value.length, max });
  };
  updateCount();
  area.addEventListener('input', updateCount);
  const wrapSel = (before, after = before, placeholder = '') => {
    const { selectionStart: a, selectionEnd: b, value: v } = area;
    const inner = v.slice(a, b) || placeholder;
    area.setRangeText(`${before}${inner}${after}`, a, b, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const linePrefix = (prefix) => {
    const { selectionStart: a, value: v } = area;
    const start = v.lastIndexOf('\n', a - 1) + 1;
    area.setRangeText(prefix, start, start, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const tool = (key, run) =>
    h('button', { class: 'mn-btn mn-btn--ghost', type: 'button', onclick: run }, t(key));
  const write = h('button', { type: 'button', 'aria-pressed': 'true' }, t('editor.write'));
  const show = h('button', { type: 'button', 'aria-pressed': 'false' }, t('editor.preview'));
  const toolbar = h(
    'div',
    { class: 'mdtools', role: 'toolbar', 'aria-label': t('editor.toolbar') },
    tool('editor.bold', () => wrapSel('**', '**', t('editor.boldPlaceholder'))),
    tool('editor.list', () => linePrefix('- ')),
    tool('editor.checklist', () => linePrefix('- [ ] ')),
    tool('editor.link', () => wrapSel('[', '](https://)', t('editor.linkPlaceholder'))),
  );
  write.addEventListener('click', () => {
    write.setAttribute('aria-pressed', 'true');
    show.setAttribute('aria-pressed', 'false');
    area.hidden = false;
    toolbar.hidden = false;
    preview.hidden = true;
  });
  show.addEventListener('click', () => {
    show.setAttribute('aria-pressed', 'true');
    write.setAttribute('aria-pressed', 'false');
    preview.textContent = '';
    preview.append(mdToDom(area.value));
    area.hidden = true;
    toolbar.hidden = true;
    preview.hidden = false;
  });
  const box = field(label, area, { hint });
  box
    .querySelector('label')
    .after(
      h(
        'div',
        { class: 'mdbar' },
        h('div', { class: 'mn-seg', role: 'group', 'aria-label': t('editor.mode') }, write, show),
        toolbar,
      ),
    );
  box.append(preview, counter);
  box.read = () => area.value;
  box.input = area;
  return box;
}

/**
 * Opens an editor sheet. `build(body, foot)` fills it; `isDirty()` says whether closing loses
 * typing. Returns { close } to close it without asking.
 */
export function editorSheet({ title, build, isDirty = () => false, onClosed, draftKey, getDraft }) {
  let force = false;
  const cancel = h('button', { class: 'mn-btn mn-btn--ghost', type: 'button' }, t('common.cancel'));
  const body = h('div', { class: 'mn-sheet-body' });
  const foot = h('div', { class: 'mn-sheet-foot' });
  const confirmBox = h('div', {
    class: 'mn-banner mn-banner--warn discard',
    role: 'alert',
    hidden: true,
  });
  const root = h(
    'div',
    {},
    h('div', { class: 'mn-sheet-bar' }, cancel, h('h2', {}, title), h('span')),
    confirmBox,
    body,
    foot,
  );
  let timer = 0;
  const close = () => {
    force = true;
    clearInterval(timer);
    window.removeEventListener('keydown', guard, true);
    window.mnui.sheet.close();
  };
  const askDiscard = () => {
    confirmBox.hidden = false;
    confirmBox.textContent = '';
    confirmBox.append(
      h('span', {}, t('form.discardQuestion')),
      ' ',
      h(
        'button',
        {
          class: 'mn-btn mn-btn--danger',
          type: 'button',
          onclick: async () => {
            if (draftKey) await app.mn.kv.delete(draftKey);
            close();
          },
        },
        t('form.discard'),
      ),
      h(
        'button',
        {
          class: 'mn-btn mn-btn--ghost',
          type: 'button',
          onclick: () => {
            confirmBox.hidden = true;
          },
        },
        t('form.keepEditing'),
      ),
    );
    confirmBox.querySelector('.mn-btn--danger')?.focus();
  };
  const guard = (event) => {
    if (event.key !== 'Escape' || force || !isDirty()) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    askDiscard();
  };
  cancel.addEventListener('click', () => (isDirty() ? askDiscard() : close()));
  window.addEventListener('keydown', guard, true);
  build(body, foot);
  window.mnui.sheet.open(root, {
    tall: true,
    modal: true,
    onClose: () => {
      clearInterval(timer);
      window.removeEventListener('keydown', guard, true);
      onClosed?.();
    },
  });
  // A draft of the typing every few seconds (one kv key per form, removed on save).
  if (draftKey && getDraft) {
    let last = '';
    timer = setInterval(() => {
      if (!isDirty()) return;
      const draft = JSON.stringify(getDraft());
      if (draft === last) return;
      last = draft;
      void app.mn.kv.set(draftKey, JSON.parse(draft));
    }, 3000);
  }
  return { close, body, foot, root };
}

/** Step tabs for long forms. */
export function steps(labels, current, onPick, done = []) {
  return h(
    'div',
    { class: 'mn-steps', role: 'tablist' },
    labels.map((label, i) =>
      h(
        'button',
        {
          type: 'button',
          class: done.includes(i) ? 'done' : '',
          'aria-current': i === current ? 'step' : null,
          onclick: () => onPick(i),
        },
        label,
      ),
    ),
  );
}

/** Marks the field boxes with problems; focuses the first. Returns true when all are fine. */
export function showErrors(problems) {
  let first = null;
  for (const [box, message] of problems) {
    box.setError(message);
    if (message && !first) first = box;
  }
  if (first) first.querySelector('input, select, textarea')?.focus();
  return !first;
}

export function busy(button, on) {
  button.disabled = on;
  button.setAttribute('aria-busy', String(on));
}
