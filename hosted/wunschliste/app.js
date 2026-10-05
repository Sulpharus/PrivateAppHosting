// Wunschliste: everyone keeps a wishlist; others reserve wishes to give them. Who reserved what
// stays hidden from the list's owner (the database never tells them, see db/001_init.sql).
// Tables: wishes (own list) and reservations (own shopping list); the functions people(),
// wishlist(owner) and reserve(wish) show and reserve other people's wishes.
import { euro, parseLink, parsePrice } from './amazon.js';
import { buildWishlistPdf } from './wishlist-pdf.js';

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const t = (key, params) => window.mnI18n.t(key, params);
const locale = () => window.mnI18n.locale;

/** Builds elements with textContent only: user data never goes through innerHTML. */
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const c of children.flat(Number.POSITIVE_INFINITY)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  return el;
}
const ICON_PATHS = {
  gift: 'M5 10h14v10H5zM3.5 6.5h17V10h-17zM12 6.5V20',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  share: 'M12 3v12M7.5 7.5L12 3l4.5 4.5M5 13v7h14v-7',
  left: 'M15 5l-7 7 7 7',
  cart: 'M4 5h2l2 10h10l2-7H7.2',
  people: 'M9 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
  photo: 'M4 7h3l1.5-2h7L17 7h3v12H4zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.append(path);
  return svg;
}
const toast = (message) => window.mnui.toast(message);
const initials = (text) =>
  String(text)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
const shop = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const priorityLabel = (p) => t(`priority.${p}`);
const dateLabel = (iso) => window.mnui.date.format(new Date(iso));

// ---------- state ----------
const params = new URLSearchParams(location.search);
const S = {
  tab: params.get('person') ? 'others' : 'mine',
  person: params.get('person'),
  me: null,
  wishes: [],
  people: [],
  personWishes: [],
  reservations: [],
  loading: true,
  error: null,
};
// Handlers work right away; the SDK and the login check run in the background.
const ready = (async () => {
  const client = await window.mininode.mininode();
  const user = await client.auth.requireLogin();
  S.me = user?.id ?? null;
  return client;
})();

async function load() {
  const mn = await ready;
  S.error = null;
  try {
    const [wishes, people, reservations] = await Promise.all([
      mn.db
        .from('wishes')
        .select('id, title, note, url, image_url, image_path, price_cents, priority, created_at')
        .order('priority')
        .order('created_at', { ascending: false }),
      mn.db.rpc('people'),
      mn.db
        .from('reservations')
        .select(
          'id, wish_id, recipient_name, title, url, image_url, price_cents, reserved_at, purchased_at',
        )
        .order('reserved_at', { ascending: false }),
    ]);
    for (const result of [wishes, people, reservations]) if (result.error) throw result.error;
    S.wishes = wishes.data;
    S.people = people.data.filter((p) => !p.mine);
    S.reservations = reservations.data;
    if (S.person) await loadPerson();
  } catch {
    S.error = t('error.load');
  }
  S.loading = false;
  render();
}

async function loadPerson() {
  const mn = await ready;
  const { data, error } = await mn.db.rpc('wishlist', { p_owner: S.person });
  if (error) throw error;
  S.personWishes = data;
}

// ---------- views ----------
const view = () => $('#view');

function render() {
  for (const tab of document.querySelectorAll('.mn-tab')) {
    if (tab.dataset.tab === S.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const tools = $('#tools');
  tools.replaceChildren();
  const main = view();
  main.replaceChildren();
  if (S.loading) {
    main.append(skeleton());
    return;
  }
  if (S.error) main.append(h('div', { class: 'mn-banner mn-banner--bad', role: 'alert' }, S.error));
  if (S.tab === 'mine') renderMine(main, tools);
  else if (S.tab === 'others') renderOthers(main, tools);
  else renderShopping(main);
}

function header(title, subtitle) {
  $('#title').textContent = title;
  $('#subtitle').textContent = subtitle;
  document.title = `${title} · ${t('app.title')}`;
}

function skeleton() {
  return h(
    'div',
    { class: 'mn-list', 'aria-busy': 'true', 'aria-label': t('state.loading') },
    [0, 1, 2].map(() => h('span', { class: 'mn-sk wish-sk' })),
  );
}

// ---------- pictures ----------
// A picture the person uploaded lives in mn.files (shared scope, so the people who see the list can
// load it) and is reached through a signed address that expires: made on demand, kept for a while.
const pictureUrls = new Map();
async function pictureUrl(path) {
  const hit = pictureUrls.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const mn = await ready;
  const url = await mn.files.url(path, { shared: true, expiresIn: 3600 });
  pictureUrls.set(path, { url, until: Date.now() + 50 * 60 * 1000 });
  return url;
}

/** Any picture file (or blob) as a JPEG no larger than `maxEdge` pixels, on white. */
async function toJpeg(source, maxEdge, quality) {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('no jpeg');
  return blob;
}

/**
 * The picture of a wish: the uploaded photo, else the link. The shopping list passes `image:
 * false`: those images come from a copy of the owner's image address, and loading it could tell the
 * owner that (and by whom) the wish was reserved, so it shows initials instead.
 */
function thumb(item, { image = true } = {}) {
  const fallback = h('span', { class: 'mn-thumb', 'aria-hidden': 'true' }, initials(item.title));
  if (!image || !(item.image_path || item.image_url)) return fallback;
  const img = h('img', {
    class: 'mn-thumb',
    alt: '',
    loading: 'lazy',
    referrerpolicy: 'no-referrer',
  });
  img.addEventListener('error', () => img.replaceWith(fallback), { once: true });
  if (item.image_path)
    pictureUrl(item.image_path).then(
      (url) => {
        img.src = url;
      },
      () => img.replaceWith(fallback),
    );
  else img.src = item.image_url;
  return img;
}

function details(item) {
  const parts = [];
  if (item.price_cents !== null && item.price_cents !== undefined)
    parts.push(euro(item.price_cents));
  if (item.priority && item.priority !== 2) parts.push(priorityLabel(item.priority));
  if (item.url) parts.push(shop(item.url));
  return parts.join(' · ');
}

function shopLink(item) {
  if (!item.url) return null;
  return h(
    'a',
    {
      class: 'mn-btn',
      href: item.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': t('wish.viewShop', { title: item.title }),
    },
    icon('link'),
    t('wish.view'),
  );
}

function renderMine(main, tools) {
  header(t('tab.mine'), t('wishes.count', { n: S.wishes.length }));
  if (S.wishes.length > 0)
    tools.append(
      h(
        'button',
        { type: 'button', class: 'mn-btn', onclick: share },
        icon('share'),
        t('mine.share'),
      ),
      h(
        'button',
        { type: 'button', class: 'mn-btn', 'data-pdf': true, onclick: () => void exportPdf() },
        icon('download'),
        t('mine.pdf'),
      ),
    );
  if (S.wishes.length === 0) {
    main.append(
      h(
        'div',
        { class: 'mn-empty' },
        h('div', { class: 'mn-empty-icon' }, icon('gift')),
        h('h3', {}, t('mine.emptyTitle')),
        h('p', {}, t('mine.emptyText')),
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => openEditor() },
          t('action.add'),
        ),
      ),
    );
    return;
  }
  main.append(
    h('p', { class: 'mn-note' }, t('mine.note')),
    h(
      'div',
      { class: 'mn-list' },
      S.wishes.map((wish) =>
        h(
          'div',
          { class: 'wish' },
          thumb(wish),
          h(
            'div',
            { class: 'wish-text' },
            h('span', { class: 'mn-row-title' }, wish.title),
            details(wish) && h('span', { class: 'mn-row-sub' }, details(wish)),
            wish.note && h('span', { class: 'wish-note' }, wish.note),
          ),
          h(
            'div',
            { class: 'wish-actions' },
            shopLink(wish),
            h(
              'button',
              {
                type: 'button',
                class: 'mn-btn',
                'aria-label': t('wish.editAria', { title: wish.title }),
                onclick: () => openEditor(wish),
              },
              t('wish.edit'),
            ),
          ),
        ),
      ),
    ),
  );
}

function renderOthers(main, tools) {
  if (S.person) return renderPerson(main, tools);
  header(t('tab.others'), t('others.subtitle'));
  if (S.people.length === 0) {
    main.append(
      h(
        'div',
        { class: 'mn-empty' },
        h('div', { class: 'mn-empty-icon' }, icon('people')),
        h('h3', {}, t('others.emptyTitle')),
        h('p', {}, t('others.emptyText')),
      ),
    );
    return;
  }
  main.append(
    h(
      'div',
      { class: 'mn-list' },
      S.people.map((person) =>
        h(
          'button',
          { type: 'button', class: 'mn-row', onclick: () => openPerson(person.user_id) },
          h('span', { class: 'mn-thumb', 'aria-hidden': 'true' }, initials(person.display_name)),
          h(
            'span',
            {},
            h('span', { class: 'mn-row-title' }, person.display_name),
            h('span', { class: 'mn-row-sub' }, t('wishes.count', { n: Number(person.wishes) })),
          ),
          h('span', { class: 'mn-row-side' }, t('wish.view')),
        ),
      ),
    ),
  );
}

function renderPerson(main, tools) {
  const person = S.people.find((p) => p.user_id === S.person);
  const name = person?.display_name ?? t('app.title');
  const open = S.personWishes.filter((w) => w.status === 'frei').length;
  header(
    name,
    S.personWishes.length ? t('person.free', { open, total: S.personWishes.length }) : '',
  );
  tools.append(
    h(
      'button',
      { type: 'button', class: 'mn-btn', onclick: () => openPerson(null) },
      icon('left'),
      t('person.allLists'),
    ),
  );
  if (S.personWishes.length === 0) {
    main.append(
      h(
        'div',
        { class: 'mn-empty' },
        h('div', { class: 'mn-empty-icon' }, icon('gift')),
        h('h3', {}, t(person ? 'person.nothing' : 'person.gone')),
        h('p', {}, t('person.later')),
      ),
    );
    return;
  }
  main.append(
    h(
      'div',
      { class: 'mn-list' },
      S.personWishes.map((wish) => {
        const given = wish.status === 'geschenkt';
        const mine = wish.status === 'von-dir';
        return h(
          'div',
          { class: `wish${given ? ' wish--given' : ''}` },
          thumb(wish),
          h(
            'div',
            { class: 'wish-text' },
            h('span', { class: 'mn-row-title' }, wish.title),
            details(wish) && h('span', { class: 'mn-row-sub' }, details(wish)),
            wish.note && h('span', { class: 'wish-note' }, wish.note),
            given &&
              h(
                'span',
                { class: 'mn-chip mn-chip--plain wish-chip' },
                icon('check'),
                t('person.given'),
              ),
            mine &&
              h(
                'span',
                { class: 'mn-chip mn-chip--ok wish-chip' },
                icon('gift'),
                t('person.yours'),
              ),
          ),
          h(
            'div',
            { class: 'wish-actions' },
            shopLink(wish),
            wish.status === 'frei' &&
              h(
                'button',
                {
                  type: 'button',
                  class: 'mn-btn mn-btn--primary',
                  'aria-label': t('person.giveAria', { title: wish.title }),
                  onclick: (e) => reserve(wish, e.currentTarget),
                },
                t('person.give'),
              ),
            mine &&
              h(
                'button',
                {
                  type: 'button',
                  class: 'mn-btn mn-btn--ghost',
                  onclick: () => {
                    const r = S.reservations.find((x) => x.wish_id === wish.id);
                    if (r) cancel(r);
                  },
                },
                t('person.cancel'),
              ),
          ),
        );
      }),
    ),
  );
}

function renderShopping(main) {
  const open = S.reservations.filter((r) => !r.purchased_at);
  const done = S.reservations.filter((r) => r.purchased_at);
  header(
    t('tab.shopping'),
    open.length ? t('shopping.open', { n: open.length }) : t('shopping.allDone'),
  );
  if (S.reservations.length === 0) {
    main.append(
      h(
        'div',
        { class: 'mn-empty' },
        h('div', { class: 'mn-empty-icon' }, icon('cart')),
        h('h3', {}, t('shopping.emptyTitle')),
        h('p', {}, t('shopping.emptyText')),
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => switchTab('others') },
          t('shopping.browse'),
        ),
      ),
    );
    return;
  }
  const byRecipient = new Map();
  for (const r of open) {
    const list = byRecipient.get(r.recipient_name) ?? [];
    list.push(r);
    byRecipient.set(r.recipient_name, list);
  }
  for (const [name, list] of byRecipient) {
    main.append(
      h(
        'div',
        { class: 'mn-sect' },
        h('h2', {}, t('shopping.for', { name }), h('small', {}, list.length)),
      ),
      h(
        'div',
        { class: 'mn-list' },
        list.map((r) => reservationRow(r)),
      ),
    );
  }
  if (done.length > 0) {
    main.append(
      h(
        'div',
        { class: 'mn-sect' },
        h('h2', {}, t('shopping.bought'), h('small', {}, done.length)),
      ),
      h(
        'div',
        { class: 'mn-list' },
        done.map((r) => reservationRow(r)),
      ),
    );
  }
}

function reservationRow(r) {
  const bought = Boolean(r.purchased_at);
  return h(
    'div',
    { class: `wish${bought ? ' wish--done' : ''}` },
    thumb(r, { image: false }),
    h(
      'div',
      { class: 'wish-text' },
      h('span', { class: 'mn-row-title' }, r.title),
      h(
        'span',
        { class: 'mn-row-sub' },
        [
          bought ? t('shopping.for', { name: r.recipient_name }) : null,
          r.price_cents !== null ? euro(r.price_cents) : null,
          t('shopping.since', { date: dateLabel(r.reserved_at) }),
        ]
          .filter(Boolean)
          .join(' · '),
      ),
      !r.wish_id &&
        !bought &&
        h(
          'span',
          { class: 'mn-chip mn-chip--warn wish-chip' },
          t('shopping.gone', { name: r.recipient_name }),
        ),
    ),
    h(
      'div',
      { class: 'wish-actions' },
      shopLink(r),
      h(
        'button',
        {
          type: 'button',
          class: bought ? 'mn-btn' : 'mn-btn mn-btn--primary',
          'aria-pressed': bought ? 'true' : 'false',
          'aria-label': t('shopping.boughtAria', { title: r.title }),
          onclick: () => setPurchased(r, !bought),
        },
        icon('check'),
        t('shopping.bought'),
      ),
      (!bought || !r.wish_id) &&
        h(
          'button',
          { type: 'button', class: 'mn-btn mn-btn--ghost', onclick: () => cancel(r) },
          t(bought ? 'shopping.remove' : 'person.cancel'),
        ),
    ),
  );
}

// ---------- actions ----------
function switchTab(tab) {
  S.tab = tab;
  if (tab !== 'others' && S.person) setPerson(null);
  render();
  view().focus?.();
}

function setPerson(id) {
  S.person = id;
  const url = new URL(location.href);
  if (id) url.searchParams.set('person', id);
  else url.searchParams.delete('person');
  history.replaceState(null, '', url);
}

async function openPerson(id) {
  setPerson(id);
  S.tab = 'others';
  S.personWishes = [];
  if (id) {
    S.loading = true;
    render();
    try {
      await loadPerson();
    } catch {
      S.error = t('error.loadPerson');
    }
    S.loading = false;
  }
  render();
  $('#title').focus?.();
}

async function reserve(wish, button) {
  button.disabled = true;
  const mn = await ready;
  const { error } = await mn.db.rpc('reserve', { p_wish: wish.id });
  if (error) {
    toast(
      /already_reserved/.test(error.message) ? t('toast.alreadyTaken') : t('toast.reserveFailed'),
    );
  } else {
    toast(t('toast.reserved'));
  }
  await load();
}

async function cancel(r) {
  const mn = await ready;
  const { error } = await mn.db.from('reservations').delete().eq('id', r.id);
  toast(error ? t('toast.failed') : t(r.purchased_at ? 'toast.removed' : 'toast.unreserved'));
  await load();
}

async function setPurchased(r, bought) {
  const mn = await ready;
  const { error } = await mn.db
    .from('reservations')
    .update({ purchased_at: bought ? new Date().toISOString() : null })
    .eq('id', r.id);
  toast(error ? t('toast.failed') : t(bought ? 'toast.markedBought' : 'toast.reopened'));
  await load();
}

/** The bytes of a wish's picture as a small JPEG, or null (no picture, or its site does not allow it). */
async function pictureForPdf(wish) {
  try {
    const src = wish.image_path ? await pictureUrl(wish.image_path) : wish.image_url;
    if (!src) return null;
    const response = await fetch(src, { mode: 'cors', referrerPolicy: 'no-referrer' });
    if (!response.ok) return null;
    const jpeg = await toJpeg(await response.blob(), 700, 0.8);
    return new Uint8Array(await jpeg.arrayBuffer());
  } catch {
    return null;
  }
}

let exporting = false;
/** The own list as a PDF with pictures, downloaded. */
async function exportPdf() {
  if (exporting || S.wishes.length === 0) return;
  exporting = true;
  const button = document.querySelector('[data-pdf]');
  button?.setAttribute('aria-busy', 'true');
  toast(t('toast.pdfBusy'));
  try {
    const mn = await ready;
    const user = await mn.auth.user();
    const meta = user?.user_metadata ?? {};
    const name = String(meta.display_name || meta.name || user?.email?.split('@')[0] || '').trim();
    const pictures = await Promise.all(S.wishes.map(pictureForPdf));
    const today = new Date();
    const bytes = buildWishlistPdf({
      title: t('pdf.title'),
      subtitle: t('pdf.subtitle', {
        name: name || t('pdf.anonymous'),
        count: t('wishes.count', { n: S.wishes.length }),
        date: today.toLocaleDateString(locale(), { dateStyle: 'long' }),
      }),
      author: name,
      wishes: S.wishes.map((wish, index) => ({
        title: wish.title,
        note: wish.note ?? '',
        price:
          wish.price_cents !== null && wish.price_cents !== undefined ? euro(wish.price_cents) : '',
        priority: wish.priority,
        priorityLabel: priorityLabel(wish.priority),
        url: wish.url ?? '',
        shop: wish.url ? shop(wish.url) : '',
        linkLabel: t('pdf.link'),
        image: pictures[index] ?? null,
      })),
      brand: t('pdf.brand'),
      pageLabel: (page, pages) => t('pdf.page', { page, pages }),
      empty: t('mine.emptyTitle'),
      now: today,
    });
    const slug =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'liste';
    const file = new Blob([bytes], { type: 'application/pdf' });
    const link = h('a', {
      href: URL.createObjectURL(file),
      download: `wunschliste-${slug}-${today.toISOString().slice(0, 10)}.pdf`,
    });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
    toast(t('toast.pdfReady'));
  } catch {
    toast(t('toast.pdfFailed'));
  } finally {
    exporting = false;
    button?.removeAttribute('aria-busy');
  }
}

async function share() {
  await ready;
  const url = new URL(location.origin);
  url.searchParams.set('person', S.me ?? '');
  const text = t('share.title');
  try {
    if (navigator.share) await navigator.share({ title: text, url: url.toString() });
    else {
      await navigator.clipboard.writeText(url.toString());
      toast(t('toast.linkCopied'));
    }
  } catch {
    // Sharing cancelled by the user.
  }
}

// ---------- editor ----------
function field(label, input, hint) {
  return h(
    'label',
    { class: 'mn-field' },
    label,
    input,
    hint && h('span', { class: 'mn-hint' }, hint),
  );
}

function openEditor(wish) {
  const form = h('form', { class: 'mn-form mn-sheet-body', novalidate: true });
  const link = h('input', {
    name: 'url',
    type: 'url',
    inputmode: 'url',
    autocomplete: 'off',
    placeholder: t('editor.urlPlaceholder'),
    value: wish?.url ?? '',
  });
  const title = h('input', {
    name: 'title',
    required: true,
    maxlength: 200,
    value: wish?.title ?? '',
  });
  const price = h('input', {
    name: 'price',
    inputmode: 'decimal',
    placeholder: t('editor.pricePlaceholder'),
    value:
      wish?.price_cents !== null && wish?.price_cents !== undefined
        ? (wish.price_cents / 100).toLocaleString(locale(), { minimumFractionDigits: 2 })
        : '',
  });
  const image = h('input', {
    name: 'image',
    type: 'url',
    inputmode: 'url',
    autocomplete: 'off',
    value: wish?.image_url ?? '',
  });
  const note = h('textarea', { name: 'note', rows: 3, maxlength: 1000 }, wish?.note ?? '');

  // The photo: chosen from the device (gallery or camera), shrunk here, uploaded when saving.
  let photo = null; // the new JPEG, when one was chosen
  let removePhoto = false;
  const preview = h('div', { class: 'photo-preview', hidden: true });
  const photoInput = h('input', {
    type: 'file',
    accept: 'image/*',
    class: 'photo-file',
    'aria-label': t('editor.photoChoose'),
  });
  const photoRemove = h(
    'button',
    { type: 'button', class: 'mn-btn', hidden: true, onclick: () => clearPhoto() },
    t('editor.photoRemove'),
  );
  const showPreview = (src) => {
    preview.replaceChildren(h('img', { src, alt: '' }));
    preview.hidden = false;
    photoRemove.hidden = false;
  };
  const clearPhoto = () => {
    photo = null;
    removePhoto = true;
    photoInput.value = '';
    preview.replaceChildren();
    preview.hidden = true;
    photoRemove.hidden = true;
  };
  if (wish?.image_path) pictureUrl(wish.image_path).then(showPreview, () => undefined);
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    try {
      photo = await toJpeg(file, 1280, 0.82);
      removePhoto = false;
      showPreview(URL.createObjectURL(photo));
      error.hidden = true;
    } catch {
      photo = null;
      photoInput.value = '';
      fail(t('editor.errPhoto'), photoInput);
    }
  });
  let priority = wish?.priority ?? 2;
  const seg = h(
    'div',
    { class: 'mn-seg', role: 'group', 'aria-label': t('priority.question') },
    [1, 2, 3].map((p) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': p === priority ? 'true' : 'false',
          onclick: (e) => {
            priority = p;
            for (const b of seg.children)
              b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
          },
        },
        priorityLabel(p),
      ),
    ),
  );
  const status = h('p', { class: 'mn-hint', 'aria-live': 'polite' });
  const onLink = () => {
    const parsed = parseLink(link.value);
    if (!parsed) {
      status.textContent = '';
      return;
    }
    if (parsed.amazon && parsed.asin) {
      link.value = parsed.url;
      if (!title.value.trim() && parsed.title) title.value = parsed.title;
      status.textContent = parsed.title ? t('editor.amazonTitle') : t('editor.amazonNoTitle');
    } else status.textContent = '';
  };
  link.addEventListener('change', onLink);
  link.addEventListener('paste', () => setTimeout(onLink, 0));
  const error = h('p', { class: 'mn-error', role: 'alert', hidden: true });
  form.append(
    h(
      'fieldset',
      {},
      h('legend', {}, t('editor.legend')),
      field(t('editor.url'), link, t('editor.urlHint')),
      status,
      field(t('editor.title'), title),
      h('div', { class: 'mn-grid-2' }, field(t('editor.price'), price)),
      h('div', { class: 'mn-field' }, h('span', {}, t('priority.short')), seg),
    ),
    h(
      'details',
      { class: 'mn-more', open: wish?.note || wish?.image_url || wish?.image_path ? true : null },
      h('summary', {}, t('editor.more')),
      h(
        'div',
        {},
        field(t('editor.note'), note, t('editor.noteHint')),
        h(
          'div',
          { class: 'mn-field' },
          h('span', {}, t('editor.photo')),
          preview,
          h('div', { class: 'photo-actions' }, photoInput, photoRemove),
          h('span', { class: 'mn-hint' }, t('editor.photoHint')),
        ),
        field(t('editor.image'), image, t('editor.imageHint')),
      ),
    ),
    error,
  );
  const fail = (message, input) => {
    error.textContent = message;
    error.hidden = false;
    input?.setAttribute('aria-invalid', 'true');
    input?.focus();
  };
  const save = async () => {
    error.hidden = true;
    for (const input of form.querySelectorAll('[aria-invalid]'))
      input.removeAttribute('aria-invalid');
    const parsedLink = link.value.trim() ? parseLink(link.value) : { url: null };
    if (!parsedLink) return fail(t('editor.errUrl'), link);
    if (!title.value.trim()) return fail(t('editor.errTitle'), title);
    const cents = parsePrice(price.value, locale());
    if (Number.isNaN(cents)) return fail(t('editor.errPrice'), price);
    const parsedImage = image.value.trim() ? parseLink(image.value) : { url: null };
    if (!parsedImage) return fail(t('editor.errImage'), image);
    const row = {
      title: title.value.trim().slice(0, 200),
      url: parsedLink.url,
      image_url: parsedImage.url,
      price_cents: cents,
      priority,
      note: note.value.trim() || null,
    };
    const mn = await ready;
    // The uploaded photo wins over a link; removing it leaves the link (if any).
    let uploaded = null;
    if (photo) {
      uploaded = `wishes/${crypto.randomUUID()}.jpg`;
      try {
        await mn.files.upload(uploaded, photo, { shared: true, contentType: 'image/jpeg' });
      } catch {
        return fail(t('editor.errUpload'));
      }
      row.image_path = uploaded;
      row.image_url = null;
    } else if (removePhoto) row.image_path = null;
    const result = wish
      ? await mn.db.from('wishes').update(row).eq('id', wish.id)
      : await mn.db.from('wishes').insert(row);
    if (result.error) {
      if (uploaded) mn.files.remove(uploaded, { shared: true }).catch(() => undefined);
      return fail(t('editor.errSave'));
    }
    // The picture that was replaced or removed is not needed any more.
    if (wish?.image_path && (uploaded || removePhoto))
      mn.files.remove(wish.image_path, { shared: true }).catch(() => undefined);
    window.mnui.sheet.close();
    toast(t(wish ? 'toast.saved' : 'toast.added'));
    await load();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void save();
  });
  let armed = false;
  const remove = wish
    ? h(
        'button',
        {
          type: 'button',
          class: 'mn-btn mn-btn--danger',
          onclick: async (e) => {
            if (!armed) {
              armed = true;
              e.currentTarget.textContent = t('editor.deleteConfirm');
              return;
            }
            const mn = await ready;
            const { error: deleteError } = await mn.db.from('wishes').delete().eq('id', wish.id);
            if (deleteError) return fail(t('editor.errDelete'));
            if (wish.image_path)
              mn.files.remove(wish.image_path, { shared: true }).catch(() => undefined);
            window.mnui.sheet.close();
            toast(t('toast.deleted'));
            await load();
          },
        },
        t('editor.delete'),
      )
    : null;
  const content = document.createDocumentFragment();
  content.append(
    h(
      'div',
      { class: 'mn-sheet-bar' },
      h(
        'button',
        { type: 'button', class: 'mn-btn mn-btn--ghost', 'data-mn-close': true },
        t('editor.cancel'),
      ),
      h('h2', {}, t(wish ? 'editor.edit' : 'editor.new')),
      h('span', {}),
    ),
    form,
    h(
      'div',
      { class: 'mn-sheet-foot' },
      remove,
      h('span', { class: 'mn-grow' }),
      h(
        'button',
        { type: 'button', class: 'mn-btn mn-btn--primary', onclick: () => void save() },
        t('editor.save'),
      ),
    ),
  );
  window.mnui.sheet.open(content, { tall: true, modal: true });
  (wish ? title : link).focus();
}

// ---------- wiring ----------
for (const tab of document.querySelectorAll('.mn-tab'))
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
for (const button of document.querySelectorAll('[data-add]'))
  button.addEventListener('click', () => {
    if (S.tab !== 'mine') switchTab('mine');
    openEditor();
  });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !document.querySelector('.mn-sheet')) void load();
});
// The packages must be there before the first text is made; a language change redraws.
await window.mnI18n.ready;
window.mnI18n.onChange(() => render());
render();
void load();
