// The sound library: SoundFonts and sound effects in MiniNode, in folders that are private
// (the person's own files) or shared (everyone who uses MuseScore here). MuseScore plays
// SoundFonts, so
//   - a .sf2 / .sf3 file in a folder is added to MuseScore as it is;
//   - the audio files of a folder (WAV, MP3, OGG, FLAC, M4A …) become one SoundFont named after
//     the folder, one key per sound from middle C upwards in alphabetical order (mn-sf2.js).
// In the editor they appear in the mixer's sound list; for effects, write a note on the key.
// Storage: `sounds/<folder>/<file>` in mn.files ({ shared: true } for shared folders); files over
// 45 MB are kept as `<file>.part0`, `.part1`, … (the storage takes at most 50 MB per file).
// Each person chooses which folders load (mn.kv setting `sounds`: { off: ["shared:Folder", …] }).
import { buildSoundFont, decodeAudio, FIRST_KEY, keyName } from './mn-sf2.js';

const ROOT = 'sounds';
const PART = 45 * 1024 * 1024;
const CACHE = 'musescore-sounds';
const KEEP = '.folder';
const SOUNDFONT = /\.sf[23]$/i;
const AUDIO = /\.(wav|mp3|ogg|oga|flac|m4a|aac|aif|aiff|webm)$/i;
const SCOPES = ['private', 'shared'];

const t = (key, params = {}) => {
  const text = window.mnI18n?.t(key, params);
  return text && text !== key ? text : key;
};
const opts = (scope) => (scope === 'shared' ? { shared: true } : {});
const folderName = (name) =>
  String(name)
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .slice(0, 60);
const fileName = (name) =>
  String(name)
    .replace(/[\\/]+/g, '-')
    .trim()
    .slice(0, 120);

// ---- storage ------------------------------------------------------------------------------------

/** Folders of a scope: [{ scope, name, files: [{ name, parts: [stored names], kind }] }]. */
async function listFolders(mn, scope) {
  const names = (await mn.files.list(ROOT, opts(scope))).filter((n) => n && !n.startsWith('.'));
  const folders = [];
  for (const folder of names.sort((a, b) => a.localeCompare(b))) {
    const stored = await mn.files.list(`${ROOT}/${folder}`, opts(scope));
    const byFile = new Map();
    for (const name of stored) {
      if (name === KEEP) continue;
      const base = name.replace(/\.part\d+$/, '');
      const entry = byFile.get(base) ?? { name: base, parts: [] };
      entry.parts.push(name);
      byFile.set(base, entry);
    }
    const files = [...byFile.values()]
      .map((file) => ({
        ...file,
        parts: file.parts.sort((a, b) => partIndex(a) - partIndex(b)),
        kind: SOUNDFONT.test(file.name) ? 'soundfont' : AUDIO.test(file.name) ? 'audio' : 'other',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    folders.push({ scope, name: folder, files });
  }
  return folders;
}
const partIndex = (name) => Number(/\.part(\d+)$/.exec(name)?.[1] ?? -1);

async function cachedBlob(mn, scope, path) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
  } catch {
    cache = null;
  }
  const key = new URL(`/__mn-sounds/${scope}/${path}`, location.href).href;
  const hit = cache && (await cache.match(key));
  if (hit) return hit.blob();
  const response = await fetch(await mn.files.url(path, opts(scope)));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  const blob = await response.blob();
  if (cache) await cache.put(key, new Response(blob));
  return blob;
}

/** The whole file (its parts joined). */
async function readFile(mn, folder, file) {
  const blobs = [];
  for (const part of file.parts) {
    blobs.push(await cachedBlob(mn, folder.scope, `${ROOT}/${folder.name}/${part}`));
  }
  return new Blob(blobs);
}

async function forgetCached(scope, path) {
  try {
    const cache = await caches.open(CACHE);
    await cache.delete(new URL(`/__mn-sounds/${scope}/${path}`, location.href).href);
  } catch {
    // nothing cached
  }
}

async function uploadFile(mn, scope, folder, file) {
  const name = fileName(file.name);
  const base = `${ROOT}/${folder}/${name}`;
  if (file.size <= PART) {
    await mn.files.upload(base, file, opts(scope));
    await forgetCached(scope, base);
    return;
  }
  for (let i = 0, offset = 0; offset < file.size; i++, offset += PART) {
    const path = `${base}.part${i}`;
    await mn.files.upload(path, file.slice(offset, offset + PART), {
      ...opts(scope),
      contentType: 'application/octet-stream',
    });
    await forgetCached(scope, path);
  }
}

async function removeFile(mn, folder, file) {
  for (const part of file.parts) {
    const path = `${ROOT}/${folder.name}/${part}`;
    await mn.files.remove(path, opts(folder.scope));
    await forgetCached(folder.scope, path);
  }
}

async function createFolder(mn, scope, name) {
  await mn.files.upload(`${ROOT}/${name}/${KEEP}`, new Blob([]), opts(scope));
}

async function removeFolder(mn, folder) {
  for (const file of folder.files) await removeFile(mn, folder, file);
  await mn.files.remove(`${ROOT}/${folder.name}/${KEEP}`, opts(folder.scope)).catch(() => {});
}

// ---- which folders load ---------------------------------------------------------------------

const folderId = (folder) => `${folder.scope}:${folder.name}`;
async function offFolders(mn) {
  const setting = await mn.kv.get('sounds').catch(() => null);
  return new Set(Array.isArray(setting?.off) ? setting.off : []);
}
async function setFolderOn(mn, folder, on) {
  const off = await offFolders(mn);
  if (on) off.delete(folderId(folder));
  else off.add(folderId(folder));
  await mn.kv.set('sounds', { off: [...off] });
}

// ---- into MuseScore ---------------------------------------------------------------------------

/** The SoundFonts of a folder: blob: addresses and file names (its own files, one built from its audio). */
async function folderSoundFonts(mn, folder) {
  const fonts = [];
  for (const file of folder.files.filter((f) => f.kind === 'soundfont')) {
    fonts.push({ url: URL.createObjectURL(await readFile(mn, folder, file)), name: file.name });
  }
  const audio = folder.files.filter((f) => f.kind === 'audio');
  if (audio.length) {
    const sounds = [];
    for (const [index, file] of audio.entries()) {
      try {
        const decoded = await decodeAudio(await readFile(mn, folder, file));
        sounds.push({ name: file.name.replace(AUDIO, ''), key: FIRST_KEY + index, ...decoded });
      } catch (error) {
        console.warn(`musescore: ${file.name} could not be decoded`, error);
      }
    }
    if (sounds.length) {
      const font = buildSoundFont(folder.name, sounds);
      fonts.push({
        url: URL.createObjectURL(new Blob([font], { type: 'application/octet-stream' })),
        name: `${folder.name}.sf2`,
      });
    }
  }
  return fonts;
}

/** Adds every folder the person has on (private and shared) to MuseScore. */
export async function loadSoundLibrary(mn, addSoundFont) {
  const off = await offFolders(mn);
  let count = 0;
  for (const scope of SCOPES) {
    let folders = [];
    try {
      folders = await listFolders(mn, scope);
    } catch (error) {
      console.warn('musescore: sound library not listed', error);
    }
    for (const folder of folders) {
      if (off.has(folderId(folder))) continue;
      try {
        for (const { url, name } of await folderSoundFonts(mn, folder)) {
          addSoundFont(url, name);
          count++;
        }
      } catch (error) {
        console.warn(`musescore: sounds of ${folder.name} not loaded`, error);
      }
    }
  }
  return count;
}

// ---- panel ------------------------------------------------------------------------------------

export function installSoundsPanel({ mn, addSoundFont }) {
  const button = document.getElementById('mn-sounds');
  if (!button) return;
  button.hidden = false;

  const element = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  const action = (label, onClick, className = 'mn-btn mn-btn--ghost') => {
    const b = element('button', { type: 'button', className, textContent: label });
    b.addEventListener('click', onClick);
    return b;
  };

  const closeButton = () => {
    const close = action(t('data.close'), () => {});
    close.setAttribute('data-mn-close', ''); // the kit's sheet closes on it
    return close;
  };

  button.addEventListener('click', () => {
    const sheet = element('div', { className: 'mn-data mn-sounds' });
    const status = element('p', { className: 'mn-data-status' });
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const body = element('div', { className: 'mn-sounds-body' });
    const report = (key, params) => (status.textContent = t(key, params));
    const failed = (error) => report('sounds.failed', { message: error?.message ?? String(error) });

    const render = async () => {
      body.replaceChildren(element('p', { textContent: t('sounds.loading') }));
      const off = await offFolders(mn);
      const sections = [];
      for (const scope of SCOPES) {
        const folders = await listFolders(mn, scope);
        const section = element('section', { className: 'mn-sounds-scope' });
        const heading = element('h3', { textContent: t(`sounds.scope.${scope}`) });
        const create = element('form', { className: 'mn-sounds-create' });
        const input = element('input', {
          type: 'text',
          required: true,
          maxLength: 60,
          placeholder: t('sounds.folderName'),
        });
        input.setAttribute('aria-label', t('sounds.folderName'));
        create.append(
          input,
          element('button', {
            type: 'submit',
            className: 'mn-btn',
            textContent: t('sounds.newFolder'),
          }),
        );
        create.addEventListener('submit', async (event) => {
          event.preventDefault();
          const name = folderName(input.value);
          if (!name) return;
          try {
            await createFolder(mn, scope, name);
            report('sounds.folderCreated', { name });
            await render();
          } catch (error) {
            failed(error);
          }
        });
        section.append(
          heading,
          element('p', {
            className: 'mn-sounds-hint',
            textContent: t(`sounds.scope.${scope}.hint`),
          }),
        );
        if (!folders.length) section.append(element('p', { textContent: t('sounds.noFolders') }));
        for (const folder of folders) section.append(folderView(folder, off));
        section.append(create);
        sections.push(section);
      }
      body.replaceChildren(...sections);
    };

    const folderView = (folder, off) => {
      const box = element('details', { className: 'mn-sounds-folder', open: true });
      const on = element('input', { type: 'checkbox', checked: !off.has(folderId(folder)) });
      on.setAttribute('aria-label', t('sounds.load', { name: folder.name }));
      on.addEventListener('change', async () => {
        try {
          await setFolderOn(mn, folder, on.checked);
          if (on.checked) {
            for (const { url, name } of await folderSoundFonts(mn, folder)) addSoundFont(url, name);
            report('sounds.loadedNow', { name: folder.name });
          } else report('sounds.offAfterReload', { name: folder.name });
        } catch (error) {
          failed(error);
        }
      });
      const summary = element('summary', {}, element('span', { textContent: folder.name }));
      const toggle = element(
        'label',
        { className: 'mn-sounds-toggle' },
        on,
        element('span', { textContent: t('sounds.inEditor') }),
      );
      const files = element('ul', { className: 'mn-plugins-list' });
      const audio = folder.files.filter((f) => f.kind === 'audio');
      for (const file of folder.files) {
        const index = audio.indexOf(file);
        const label =
          file.kind === 'audio'
            ? t('sounds.effectKey', { name: file.name, key: keyName(FIRST_KEY + index) })
            : file.name;
        const remove = action(t('sounds.remove'), async () => {
          if (!confirm(t('sounds.confirmRemove', { name: file.name }))) return;
          try {
            await removeFile(mn, folder, file);
            report('sounds.removed', { name: file.name });
            await render();
          } catch (error) {
            failed(error);
          }
        });
        remove.setAttribute('aria-label', t('sounds.removeNamed', { name: file.name }));
        files.append(element('li', {}, element('span', { textContent: label }), remove));
      }
      const picker = element('input', {
        type: 'file',
        multiple: true,
        hidden: true,
        accept: '.sf2,.sf3,.wav,.mp3,.ogg,.oga,.flac,.m4a,.aac,.aif,.aiff,.webm,audio/*',
      });
      picker.dataset.mnNative = '';
      picker.addEventListener('change', async () => {
        const chosen = [...(picker.files ?? [])];
        picker.value = '';
        if (!chosen.length) return;
        try {
          for (const [i, file] of chosen.entries()) {
            report('sounds.uploading', { name: file.name, done: i, total: chosen.length });
            await uploadFile(mn, folder.scope, folder.name, file);
          }
          report('sounds.uploaded', { count: chosen.length });
          await render();
        } catch (error) {
          failed(error);
        }
      });
      const actions = element(
        'div',
        { className: 'mn-data-actions' },
        action(t('sounds.addFiles'), () => picker.click(), 'mn-btn'),
        element('span', { className: 'mn-grow' }),
        action(t('sounds.removeFolder'), async () => {
          if (!confirm(t('sounds.confirmRemoveFolder', { name: folder.name }))) return;
          try {
            await removeFolder(mn, folder);
            report('sounds.removed', { name: folder.name });
            await render();
          } catch (error) {
            failed(error);
          }
        }),
      );
      box.append(summary, toggle, files, actions, picker);
      return box;
    };

    sheet.append(
      element('h2', { textContent: t('sounds.title') }),
      element('p', { className: 'mn-data-intro', textContent: t('sounds.intro') }),
      body,
      status,
      element('div', { className: 'mn-data-actions' }, closeButton()),
    );
    window.mnui.sheet.open(sheet, { label: t('sounds.title'), tall: true });
    render().catch(failed);
  });
}
