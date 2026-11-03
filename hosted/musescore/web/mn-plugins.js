// Plugins shared by everyone who uses MuseScore in this MiniNode: each plugin is one ZIP in the
// app's shared files (`mn.files`, `{ shared: true }`: readable and writable by every person with the
// app), named `plugins/<id>@<hash>.zip`. Before the editor starts they are unpacked into
// /files/plugins/<id>/, MuseScore's plugin folder in this build; each person enables the ones they
// want on MuseScore's Plugins page (as on the desktop, new plugins start disabled).
// The ZIPs stay in this browser's Cache Storage under their name (the hash changes with the content).
import { readZip, safeName, writeZip } from './mn-data.js';
import { pluginPrompt } from './mn-plugin-prompt.js';

export const PLUGINS_DIR = '/files/plugins';
const FOLDER = 'plugins';
const CACHE = 'musescore-plugins';
const SHARED = { shared: true };

const t = (key, params = {}) => {
  const text = window.mnI18n?.t(key, params);
  return text && text !== key ? text : key;
};

/** `plugins/<id>@<hash>.zip` → { id, file } for every stored plugin (newest name per id wins). */
async function storedPlugins(mn) {
  const names = await mn.files.list(FOLDER, SHARED);
  const byId = new Map();
  for (const name of names) {
    const match = /^([\w.-]+)@([0-9a-f]{12})\.zip$/.exec(name);
    if (match) byId.set(match[1], { id: match[1], file: `${FOLDER}/${name}` });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function download(mn, file) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
  } catch {
    cache = null;
  }
  const key = new URL(`/__mn-plugins/${file}`, location.href).href;
  const cached = cache && (await cache.match(key));
  if (cached) return cached.blob();
  const response = await fetch(await mn.files.url(file, SHARED));
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  const blob = await response.blob();
  if (cache) await cache.put(key, new Response(blob));
  return blob;
}

/** A ZIP's files, without a single top folder the archive may wrap them in. */
function withoutTopFolder(files) {
  const tops = new Set(files.map(([name]) => name.split('/')[0]));
  const wrapped = tops.size === 1 && files.every(([name]) => name.includes('/'));
  return wrapped ? files.map(([name, data]) => [name.slice(name.indexOf('/') + 1), data]) : files;
}

function removeTree(FS, dir) {
  let names;
  try {
    names = FS.readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === '.' || name === '..') continue;
    const path = `${dir}/${name}`;
    if (FS.isDir(FS.stat(path).mode)) removeTree(FS, path);
    else FS.unlink(path);
  }
  FS.rmdir(dir);
}

function unpack(FS, id, files) {
  const dir = `${PLUGINS_DIR}/${id}`;
  removeTree(FS, dir);
  for (const [name, data] of withoutTopFolder(files)) {
    const target = safeName(name);
    if (!target || name.endsWith('/')) continue;
    const path = `${dir}/${target}`;
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    FS.writeFile(path, data);
  }
}

/** Puts every shared plugin into /files/plugins (before the editor starts). */
export async function installSharedPlugins(mn, FS) {
  FS.mkdirTree(PLUGINS_DIR);
  const plugins = await storedPlugins(mn);
  await Promise.all(
    plugins.map(async ({ id, file }) => {
      try {
        unpack(FS, id, await readZip(await download(mn, file)));
      } catch (error) {
        console.warn(`musescore: plugin ${id} not loaded`, error);
      }
    }),
  );
  return plugins.length;
}

async function sha12(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

const idOf = (fileName) =>
  fileName
    .replace(/\.(zip|qml)$/i, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'plugin';

/** A .qml file or a plugin folder as .zip → stored for everyone and unpacked here. */
async function addPlugin(mn, FS, file) {
  const id = idOf(file.name);
  let files;
  if (/\.qml$/i.test(file.name)) {
    files = [[file.name, new Uint8Array(await file.arrayBuffer())]];
  } else {
    files = withoutTopFolder(await readZip(file));
  }
  if (!files.some(([name]) => /\.qml$/i.test(name))) throw new Error(t('plugins.invalid'));
  const zip = writeZip(files);
  const name = `${FOLDER}/${id}@${await sha12(zip)}.zip`;
  const previous = (await storedPlugins(mn)).find((plugin) => plugin.id === id);
  await mn.files.upload(name, zip, { ...SHARED, contentType: 'application/zip' });
  if (previous && previous.file !== name) await mn.files.remove(previous.file, SHARED);
  unpack(FS, id, files);
  return id;
}

async function removePlugin(mn, FS, plugin) {
  await mn.files.remove(plugin.file, SHARED);
  removeTree(FS, `${PLUGINS_DIR}/${plugin.id}`);
}

// ---- panel ------------------------------------------------------------------------------------

export function installPluginsPanel({ mn, Module }) {
  const open = () => {
    const sheet = document.createElement('div');
    sheet.className = 'mn-data mn-plugins';
    sheet.innerHTML = `
      <h2></h2>
      <p class="mn-data-intro"></p>
      <ul class="mn-plugins-list" aria-live="polite"></ul>
      <p class="mn-data-status" role="status" aria-live="polite"></p>
      <div class="mn-data-actions">
        <button type="button" class="mn-btn mn-btn--ghost" data-mn-close></button>
        <span class="mn-grow"></span>
        <button type="button" class="mn-btn mn-btn--primary" data-action="add"></button>
      </div>
      <details class="mn-plugins-prompt">
        <summary></summary>
        <p></p>
        <textarea readonly rows="8" spellcheck="false"></textarea>
        <div class="mn-data-actions"><span class="mn-grow"></span><button type="button" class="mn-btn" data-action="copy"></button></div>
      </details>
      <input type="file" accept=".zip,.qml,application/zip" hidden data-mn-native>`;
    sheet.querySelector('h2').textContent = t('plugins.title');
    sheet.querySelector('.mn-data-intro').textContent = t('plugins.intro');
    sheet.querySelector('[data-mn-close]').textContent = t('data.close');
    sheet.querySelector('[data-action="add"]').textContent = t('plugins.add');
    sheet.querySelector('.mn-plugins-prompt summary').textContent = t('plugins.prompt.title');
    sheet.querySelector('.mn-plugins-prompt p').textContent = t('plugins.prompt.intro');
    const prompt = sheet.querySelector('.mn-plugins-prompt textarea');
    prompt.value = pluginPrompt(window.mnI18n?.lang ?? 'de');
    prompt.setAttribute('aria-label', t('plugins.prompt.title'));
    const copy = sheet.querySelector('[data-action="copy"]');
    copy.textContent = t('plugins.prompt.copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(prompt.value);
      } catch {
        prompt.select();
        document.execCommand('copy');
      }
      window.mnui?.toast(t('plugins.prompt.copied'));
    });

    const list = sheet.querySelector('.mn-plugins-list');
    const status = sheet.querySelector('.mn-data-status');
    const addButton = sheet.querySelector('[data-action="add"]');
    const refresh = async () => {
      list.replaceChildren(
        Object.assign(document.createElement('li'), { textContent: t('plugins.loading') }),
      );
      try {
        const plugins = await storedPlugins(mn);
        list.replaceChildren();
        if (!plugins.length) {
          list.append(
            Object.assign(document.createElement('li'), { textContent: t('plugins.empty') }),
          );
          return;
        }
        for (const plugin of plugins) {
          const item = document.createElement('li');
          const name = Object.assign(document.createElement('span'), { textContent: plugin.id });
          const remove = Object.assign(document.createElement('button'), {
            type: 'button',
            className: 'mn-btn mn-btn--ghost',
            textContent: t('plugins.remove'),
          });
          remove.setAttribute('aria-label', t('plugins.removeNamed', { name: plugin.id }));
          remove.addEventListener('click', async () => {
            if (!confirm(t('plugins.confirmRemove', { name: plugin.id }))) return;
            remove.disabled = true;
            try {
              await removePlugin(mn, Module.FS, plugin);
              status.textContent = t('plugins.removed', { name: plugin.id });
              await refresh();
            } catch (error) {
              status.textContent = t('plugins.failed', {
                message: error?.message ?? String(error),
              });
              remove.disabled = false;
            }
          });
          item.append(name, remove);
          list.append(item);
        }
      } catch (error) {
        list.replaceChildren();
        status.textContent = t('plugins.failed', { message: error?.message ?? String(error) });
      }
    };

    const input = sheet.querySelector('input[type="file"]');
    addButton.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      addButton.disabled = true;
      status.textContent = t('plugins.adding', { name: file.name });
      try {
        const id = await addPlugin(mn, Module.FS, file);
        status.textContent = t('plugins.added', { name: id });
        await refresh();
      } catch (error) {
        status.textContent = t('plugins.failed', { message: error?.message ?? String(error) });
      } finally {
        addButton.disabled = false;
      }
    });

    window.mnui.sheet.open(sheet, { label: t('plugins.title') });
    refresh();
  };

  document.getElementById('mn-plugins')?.addEventListener('click', open);
  const button = document.getElementById('mn-plugins');
  if (button) button.hidden = false;
  // MuseScore's Plugins page has a "Manage plugins…" button that opens mininode:plugins.
  const nativeOpen = window.open.bind(window);
  window.open = (url, ...rest) => {
    if (String(url).startsWith('mininode:plugins')) {
      open();
      return null;
    }
    return nativeOpen(url, ...rest);
  };
}
