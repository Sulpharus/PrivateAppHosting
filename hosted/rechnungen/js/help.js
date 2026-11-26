// Help sheets ("?" per view), the shortcut list and short one-time hints (kv seen:<hint>).
import { app } from './ctx.js';
import { h, icon, t } from './dom.js';

const seen = new Set();
const HINTS = ['invoicesLocked', 'itemsReuse', 'statsMeaning'];

export async function loadSeen() {
  try {
    // kv-collection-ok: up to three one-time hint flags (seen:<hint>), as the onboarding guide asks
    for (const { key } of await app.mn.kv.list('seen:')) seen.add(key.slice(5));
  } catch {
    // Hints are an extra.
  }
}

/** Shows a hint once, above the list in `container`. */
export function hint(key, container) {
  if (!HINTS.includes(key) || seen.has(key)) return;
  const note = h(
    'div',
    { class: 'mn-banner', role: 'note' },
    h('span', {}, t(`hint.${key}`)),
    ' ',
    h(
      'button',
      {
        class: 'mn-btn mn-btn--ghost',
        type: 'button',
        onclick: () => {
          seen.add(key);
          note.remove();
          void app.mn.kv.set(`seen:${key}`, true);
        },
      },
      t('hint.ok'),
    ),
  );
  container.append(note);
}

export async function resetHints() {
  for (const key of [...seen]) await app.mn.kv.delete(`seen:${key}`);
  seen.clear();
}

function sheet(title, ...content) {
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'mn-sheet-bar' },
      h(
        'button',
        { class: 'mn-btn mn-btn--ghost', type: 'button', 'data-mn-close': '' },
        t('common.close'),
      ),
      h('h2', {}, title),
      h('span'),
    ),
    h('div', { class: 'mn-sheet-body' }, ...content),
  );
}

export function helpButton(view) {
  return h(
    'button',
    {
      class: 'mn-icon-btn',
      type: 'button',
      'aria-label': t('help.open'),
      title: t('help.open'),
      onclick: () => {
        const paragraphs = [1, 2, 3]
          .map((n) => t(`help.${view}.${n}`))
          .filter((text) => text && !text.startsWith('help.'));
        window.mnui.sheet.open(
          sheet(
            t(`help.${view}.title`),
            paragraphs.map((p) => h('p', {}, p)),
          ),
        );
      },
    },
    icon('help'),
  );
}

export function openShortcuts() {
  const keys = [
    ['n', 'keys.new'],
    ['/', 'keys.search'],
    ['j / k', 'keys.move'],
    ['e', 'keys.open'],
    ['Esc', 'keys.close'],
    ['?', 'keys.help'],
  ];
  window.mnui.sheet.open(
    sheet(
      t('keys.title'),
      h(
        'dl',
        { class: 'mn-facts' },
        keys.map(([key, label]) =>
          h('div', {}, h('dt', {}, h('kbd', {}, key)), h('dd', {}, t(label))),
        ),
      ),
      h('p', { class: 'mn-note' }, t('keys.multi')),
    ),
  );
}
