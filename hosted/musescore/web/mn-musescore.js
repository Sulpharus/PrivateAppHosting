// MuseScore Studio in MiniNode: starts the editor (Qt for WebAssembly) after the login, with
//   - the program's shared files (templates, instruments, styles …) unpacked into /files/share,
//   - the person's MuseScore data (settings, workspaces, palettes, plugins) in /files/data, kept
//     in this browser (IndexedDB) and written back a moment after each change,
//   - open, save and export through MiniNode's file dialog (the person's files in MiniNode, or the
//     device; kit files.js): the editor asks Module.mnFileDialog and writes into /mn-save/, and
//     every file it finishes there goes to the chosen place,
//   - its audio engine in an AudioWorklet and the SoundFont (MS Basic) loaded in the background.
// Written for this app; the editor itself is MuseScore Studio built by toolchain/ (see README).

import { createAudioDriver } from './mn-audio.js';
// Names and sizes of this build's files, written by build.mjs.
import build from './mn-build.js';
import { installDataMenu } from './mn-data.js';
import { unpackShare } from './mn-share.js';
import { soundFontUrl } from './mn-soundfont.js';
import qtLoad from './qtloader.js';

const DATA_DIR = '/files/data';
const SHARE_DIR = '/files/share';
const SAVE_DIR = '/mn-save';
const OPEN_DIR = '/interactive';

const t = (key, params = {}) => {
  const text = window.mnI18n?.t(key, params);
  return text && text !== key ? text : key;
};
const status = document.getElementById('mn-status');
const progress = document.getElementById('mn-progress');
const showStep = (key, value) => {
  status.querySelector('[data-step]').textContent = t(key);
  if (value === undefined) progress.removeAttribute('value');
  else progress.value = value;
};
const fail = (error) => {
  console.error('musescore:', error);
  status.hidden = false;
  status.classList.add('mn-failed');
  status.querySelector('[data-step]').textContent = t('app.failed');
  progress.hidden = true;
};

/** The person is signed in and the page speaks their language. */
async function account() {
  const mn = await window.mininode.mininode();
  await mn.auth.requireLogin();
  await window.mnI18n?.ready;
  return mn;
}

// ---- user data: /files/data in IndexedDB --------------------------------------------------------

/** Mounts the person's MuseScore data and fills it from this browser's IndexedDB. */
function mountData(Module) {
  const { FS, IDBFS } = Module;
  FS.mkdirTree(DATA_DIR);
  FS.mount(IDBFS, {}, DATA_DIR);
  Module.addRunDependency('mn-data');
  FS.syncfs(true, (error) => {
    if (error) console.warn('musescore: stored data could not be read', error);
    Module.removeRunDependency('mn-data');
  });
}

let syncTimer = 0;
let syncing = false;
let syncAgain = false;
/** Writes /files/data back to IndexedDB, at most once at a time. */
function persistData(Module, delay = 800) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (syncing) {
      syncAgain = true;
      return;
    }
    syncing = true;
    Module.FS.syncfs(false, (error) => {
      syncing = false;
      if (error) console.warn('musescore: data could not be stored', error);
      if (syncAgain) {
        syncAgain = false;
        persistData(Module, 0);
      }
    });
  }, delay);
}

// ---- file dialogs ---------------------------------------------------------------------------

/** "MuseScore file (*.mscz *.mscx)" → { description, extensions: ['.mscz', '.mscx'] } */
function parseFilter(filter) {
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(filter);
  const patterns = (match ? match[2] : filter).split(/\s+/).filter(Boolean);
  const extensions = patterns
    .map((pattern) => pattern.replace(/^\*/, '').toLowerCase())
    .filter((ext) => /^\.[a-z0-9]+$/.test(ext));
  return { description: match ? match[1] : filter, extensions };
}

const baseName = (path) => String(path).split('/').pop() || '';
const extensionOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
};

/** A save target per folder below /mn-save: the handle the person chose and its folder. */
const saveTargets = new Map();
let nextSaveFolder = 1;

async function openFiles(Module, options) {
  const filters = options.filter.map(parseFilter).filter((f) => f.extensions.length);
  const accept = filters.flatMap((f) => f.extensions);
  const types = accept.length
    ? [{ description: filters[0].description, accept: { 'application/octet-stream': accept } }]
    : undefined;
  let files;
  if (window.showOpenFilePicker) {
    const handles = await window.showOpenFilePicker({ multiple: options.multiple, types });
    files = await Promise.all(handles.map((handle) => handle.getFile()));
  } else {
    files = await new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'file',
        multiple: options.multiple,
        accept: accept.join(','),
      });
      input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true });
      input.addEventListener('cancel', () => resolve([]), { once: true });
      input.click();
    });
  }
  const paths = [];
  for (const file of files) {
    const path = `${OPEN_DIR}/${file.name}`;
    Module.FS.mkdirTree(OPEN_DIR);
    Module.FS.writeFile(path, new Uint8Array(await file.arrayBuffer()));
    paths.push(path);
  }
  return paths;
}

async function chooseSaveTarget(Module, options) {
  const filters = options.filter.map(parseFilter).filter((f) => f.extensions.length);
  let name = baseName(options.path) || 'Score';
  const first = filters[0];
  if (first && !first.extensions.includes(extensionOf(name))) {
    name = `${name.replace(/\.[^.]*$/, '')}${first.extensions[0]}`;
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: name,
    types: filters.map((f) => ({
      description: f.description,
      accept: { 'application/octet-stream': f.extensions },
    })),
  });
  const folder = `${SAVE_DIR}/${nextSaveFolder++}`;
  Module.FS.mkdirTree(folder);
  saveTargets.set(folder, { handle, name: handle.name || name });
  return `${folder}/${handle.name || name}`;
}

/** Called by the editor for every file dialog; answers with paths (none when cancelled). */
function installFileDialogs(Module) {
  Module.mnFileDialog = (options, done) => {
    const plain = {
      kind: String(options.kind),
      title: String(options.title),
      path: String(options.path),
      filter: Array.from({ length: options.filter.length }, (_, i) => String(options.filter[i])),
      multiple: Boolean(options.multiple),
    };
    const run = plain.kind === 'save' ? chooseSaveTarget(Module, plain) : openFiles(Module, plain);
    Promise.resolve(run)
      .then((result) => done(Array.isArray(result) ? result : [result]))
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('musescore: file dialog', error);
        done([]);
      });
  };
  // Upstream's asynchronous "open" (score files dropped on the start screen use it).
  Module.openFileDialog = (callback) => {
    openFiles(Module, { filter: [], multiple: false })
      .then(([path]) => {
        if (!path) return callback('', new Uint8Array());
        callback(baseName(path), Module.FS.readFile(path));
      })
      .catch(() => callback('', new Uint8Array()));
  };
  // The editor reports each saved project too; the file hook below already handles it.
  Module.onProjectSaved = () => {};
}

// ---- files the editor writes ----------------------------------------------------------------

const pendingSaves = new Map();

/** Hands a finished file below /mn-save to the place chosen for its folder. */
async function deliver(Module, path) {
  const folder = path.slice(0, path.lastIndexOf('/'));
  const target = saveTargets.get(folder);
  if (!target) return;
  const name = baseName(path);
  let data;
  try {
    data = Module.FS.readFile(path);
  } catch {
    return; // removed again (a temporary file)
  }
  const blob = new Blob([data], { type: 'application/octet-stream' });
  if (name === target.name) {
    const writable = await target.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  // A further file of the same export (parts, pages): same place, its own name.
  const nativeHandle =
    typeof FileSystemHandle !== 'undefined' && target.handle instanceof FileSystemHandle;
  if (typeof target.handle.getFile === 'function' && !nativeHandle) {
    const mn = await window.mininode.mininode();
    await mn.files.upload(name, blob);
    window.mnui?.toast(t('files.save.done', { name }));
  } else {
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: name,
      hidden: true,
    });
    link.dataset.mnNative = '';
    document.body.append(link);
    HTMLAnchorElement.prototype.click.call(link);
    link.remove();
  }
}

/** Watches files the editor closes: saves and exports, and changes to the user data. */
function installWriteHook(Module) {
  const { FS } = Module;
  const close = FS.close;
  FS.close = function closeAndDeliver(stream) {
    const path = stream?.path ?? '';
    const written = Boolean(stream && (stream.flags & 3) !== 0); // O_WRONLY | O_RDWR
    const result = close.call(this, stream);
    if (written && path.startsWith(`${SAVE_DIR}/`)) {
      clearTimeout(pendingSaves.get(path));
      pendingSaves.set(
        path,
        setTimeout(() => {
          pendingSaves.delete(path);
          deliver(Module, path).catch((error) => {
            console.error('musescore: saving failed', error);
            window.mnui?.toast(t('files.error', { message: error?.message ?? String(error) }));
          });
        }, 150),
      );
    }
    if (written && path.startsWith(`${DATA_DIR}/`)) persistData(Module);
    return result;
  };
  addEventListener('pagehide', () => persistData(Module, 0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistData(Module, 0);
  });
}

// ---- start ----------------------------------------------------------------------------------

async function start() {
  showStep('app.step.account');
  const mn = await account();
  document.documentElement.lang = window.mnI18n?.lang ?? document.documentElement.lang;

  showStep('app.step.program', 0);
  const share = unpackShare(build.share, (value) => (progress.value = value));
  const screen = document.getElementById('screen');
  const driver = createAudioDriver(build.audio);

  const Module = {
    config: { MUSE_MODULE_AUDIO_WORKER: 'OFF' },
    soundFont: '',
    // The module is named after its content (build.mjs), so browsers may keep it for a year.
    locateFile: (name) => (name === 'MuseScoreStudio.wasm' ? `./${build.wasm}` : name),
    driver,
    qt: {
      entryFunction: window.MuseScoreStudio_entry,
      containerElements: [screen],
      environment: { MININODE_LANGUAGE: window.mnI18n?.lang ?? 'de' },
      onLoaded: () => {
        status.hidden = true;
        window.__mnReady = true;
        dispatchEvent(new Event('mn:ready'));
      },
      onExit: (exit) => {
        if (exit?.crashed) fail(new Error(exit.text ?? 'crashed'));
      },
    },
    preRun: [
      (instance) => {
        mountData(instance);
        instance.FS.mkdirTree(SHARE_DIR);
        instance.addRunDependency('mn-share');
        share
          .then((files) => {
            for (const [path, bytes] of files) {
              instance.FS.mkdirTree(`${SHARE_DIR}/${path}`.replace(/\/[^/]*$/, ''));
              instance.FS.writeFile(`${SHARE_DIR}/${path}`, bytes);
            }
            showStep('app.step.start');
          })
          .catch(fail)
          .finally(() => instance.removeRunDependency('mn-share'));
      },
    ],
    onStartApp: async () => {
      // The audio driver needs a user gesture before it may play; it opens on the first click.
      await driver.setup(Module);
      soundFontUrl(build.soundFont)
        .then((url) => {
          Module.soundFont = url;
          if (driver.inited) Module.ccall('addSoundFont', '', ['string'], [url]);
        })
        .catch((error) => console.warn('musescore: SoundFont not loaded', error));
    },
  };
  // Main <=> audio engine messages (the engine runs in the AudioWorklet).
  Module.main_worker_rpcChannel = new MessageChannel();
  Module.main_worker_rpcSend = (data) => Module.main_worker_rpcChannel.port1.postMessage(data);
  Module.main_worker_rpcListen = () => {};
  Module.main_worker_rpcChannel.port1.onmessage = (event) =>
    Module.main_worker_rpcListen(event.data);
  Module.driver_worker_rpcChannel = new MessageChannel();
  installFileDialogs(Module);
  addEventListener(
    'pointerdown',
    () => {
      if (driver.inited) Module._startAudioProcessing();
      else Module.isNeedStartAudio = true;
    },
    { once: true, capture: true },
  );

  const instance = await qtLoad(Module);
  installWriteHook(instance);
  installDataMenu({
    mn,
    Module: instance,
    dataDir: DATA_DIR,
    persist: () => persistData(instance, 0),
  });
}

start().catch(fail);
