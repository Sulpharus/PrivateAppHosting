// "Partituren" in the MiniNode bar: earlier versions of the person's scores in MiniNode, and scores
// shared with everyone who uses the app.
//   - Every save to MiniNode also keeps a copy in the hidden folder .versions/<score>/ (the newest
//     MAX_VERSIONS); one can be restored as a file of its own next to the score.
//   - "Teilen" copies a score into the app's shared files (scores/), where everyone can copy it
//     into their own files; anyone with the app can remove a shared score, as with plugins.

const t = (key, params = {}) => {
  const text = window.mnI18n?.t(key, params);
  return text && text !== key ? text : key;
};

const VERSIONS = '.versions';
const SHARED = 'scores';
const MAX_VERSIONS = 20;
const SCORE = /\.(mscz|mscx)$/i;

/** "2026-11-04T10-12-05-123Z.mscz" ↔ Date (file names cannot hold ":"). */
const stampOf = (date) => `${date.toISOString().replaceAll(':', '-').replace('.', '-')}`;
const dateOf = (name) => {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  return match ? new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`) : null;
};
const formatDate = (date) =>
  new Intl.DateTimeFormat(window.mnI18n?.lang ?? 'de', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

/** Keeps `blob` as the newest version of `name` and drops the oldest past MAX_VERSIONS. */
export async function keepVersion(mn, name, blob) {
  if (!SCORE.test(name)) return;
  const folder = `${VERSIONS}/${name}`;
  const extension = name.slice(name.lastIndexOf('.'));
  await mn.files.upload(`${folder}/${stampOf(new Date())}${extension}`, blob);
  const versions = (await mn.files.list(folder)).filter((entry) => dateOf(entry)).sort();
  for (const old of versions.slice(0, Math.max(0, versions.length - MAX_VERSIONS))) {
    await mn.files.remove(`${folder}/${old}`);
  }
}

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const button = (label, className, onClick) =>
  el('button', {
    type: 'button',
    className: `mn-btn ${className}`,
    textContent: label,
    onclick: onClick,
  });

async function copyFile(mn, from, to, options = {}) {
  const response = await fetch(await mn.files.url(from, options.from));
  if (!response.ok) throw new Error(t('scores.notLoaded', { name: from }));
  await mn.files.upload(to, await response.blob(), options.to);
}

/** A name next to `name` that is not taken yet: "Lied (Version 4. Nov. 2026).mscz", "… (2)". */
function freeName(taken, base, extension) {
  let name = `${base}${extension}`;
  for (let n = 2; taken.has(name); n++) name = `${base} (${n})${extension}`;
  return name;
}

export function installScoresPanel({ mn }) {
  const open = document.getElementById('mn-scores');
  if (!open) return;
  open.hidden = false;
  open.addEventListener('click', () => show(mn));
}

function show(mn) {
  const root = el('div', { className: 'mn-scores' });
  const status = el('p', { className: 'mn-scores-status', role: 'status' });
  status.setAttribute('aria-live', 'polite');
  const mine = el('ul', { className: 'mn-scores-list' });
  const shared = el('ul', { className: 'mn-scores-list' });
  root.append(
    el('h2', { textContent: t('scores.title') }),
    el('p', { textContent: t('scores.intro') }),
    status,
    el('h3', { textContent: t('scores.mine') }),
    mine,
    el('h3', { textContent: t('scores.shared') }),
    shared,
    el(
      'div',
      { className: 'mn-scores-actions' },
      button(t('scores.close'), 'mn-btn--ghost', () => window.mnui.sheet.close()),
    ),
  );
  const report = (text) => {
    status.textContent = text;
  };
  const run = (work) =>
    work().catch((error) =>
      report(t('scores.error', { message: error?.message ?? String(error) })),
    );

  async function listMine() {
    mine.replaceChildren(el('li', { textContent: t('scores.loading') }));
    const names = (await mn.files.list()).filter((name) => SCORE.test(name)).sort();
    mine.replaceChildren(
      ...(names.length
        ? names.map((name) => {
            const versions = el('ul', { className: 'mn-scores-versions', hidden: true });
            const row = el(
              'li',
              {},
              el('span', { className: 'mn-scores-name', textContent: name }),
              button(t('scores.versions'), '', () =>
                run(async () => {
                  versions.hidden = !versions.hidden;
                  if (!versions.hidden) await listVersions(name, versions, new Set(names));
                }),
              ),
              button(t('scores.share'), '', () =>
                run(async () => {
                  report(t('scores.sharing', { name }));
                  await copyFile(mn, name, `${SHARED}/${name}`, { to: { shared: true } });
                  report(t('scores.shared.done', { name }));
                  await listShared();
                }),
              ),
              versions,
            );
            return row;
          })
        : [el('li', { textContent: t('scores.none') })]),
    );
  }

  async function listVersions(name, list, taken) {
    list.replaceChildren(el('li', { textContent: t('scores.loading') }));
    const folder = `${VERSIONS}/${name}`;
    const entries = (await mn.files.list(folder))
      .filter((entry) => dateOf(entry))
      .sort()
      .reverse();
    const extension = name.slice(name.lastIndexOf('.'));
    const base = name.slice(0, name.lastIndexOf('.'));
    list.replaceChildren(
      ...(entries.length
        ? entries.map((entry) => {
            const when = formatDate(dateOf(entry));
            return el(
              'li',
              {},
              el('span', { textContent: when }),
              button(t('scores.restore'), '', () =>
                run(async () => {
                  const target = freeName(
                    taken,
                    `${base} (${t('scores.versionOf', { date: when })})`,
                    extension,
                  );
                  await copyFile(mn, `${folder}/${entry}`, target);
                  taken.add(target);
                  report(t('scores.restored', { name: target }));
                  await listMine();
                }),
              ),
            );
          })
        : [el('li', { textContent: t('scores.noVersions') })]),
    );
  }

  async function listShared() {
    shared.replaceChildren(el('li', { textContent: t('scores.loading') }));
    const names = (await mn.files.list(SHARED, { shared: true })).filter((name) =>
      SCORE.test(name),
    );
    shared.replaceChildren(
      ...(names.length
        ? names.sort().map((name) =>
            el(
              'li',
              {},
              el('span', { className: 'mn-scores-name', textContent: name }),
              button(t('scores.copy'), '', () =>
                run(async () => {
                  const taken = new Set(await mn.files.list());
                  const extension = name.slice(name.lastIndexOf('.'));
                  const target = freeName(taken, name.slice(0, name.lastIndexOf('.')), extension);
                  await copyFile(mn, `${SHARED}/${name}`, target, { from: { shared: true } });
                  report(t('scores.copied', { name: target }));
                  await listMine();
                }),
              ),
              button(t('scores.unshare'), 'mn-btn--ghost', () =>
                run(async () => {
                  if (!window.confirm(t('scores.unshareConfirm', { name }))) return;
                  await mn.files.remove(`${SHARED}/${name}`, { shared: true });
                  report(t('scores.unshared', { name }));
                  await listShared();
                }),
              ),
            ),
          )
        : [el('li', { textContent: t('scores.noneShared') })]),
    );
  }

  window.mnui.sheet.open(root, { label: t('scores.title'), tall: true });
  run(listMine);
  run(listShared);
}
