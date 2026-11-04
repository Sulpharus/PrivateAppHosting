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
import { installDataMenu, readZip } from './mn-data.js';
import {
  createSoundFontNames,
  DEFAULT_SOUNDFONT,
  keepQueuedEventTargets,
  soundFontUri,
} from './mn-glue.js';
import { installMidi } from './mn-midi.js';
import { installPluginsPanel, installSharedPlugins } from './mn-plugins.js';
import { installScoresPanel, keepVersion } from './mn-scores.js';
import { unpackShare } from './mn-share.js';
import { soundFontUrl } from './mn-soundfont.js';
import { installSoundsPanel, loadSoundLibrary } from './mn-sounds.js';
import { createAccountSync, restoreFromAccount } from './mn-sync.js';
import qtLoad from './qtloader.js';

const DATA_DIR = '/files/data';
const SHARE_DIR = '/files/share';
const SAVE_DIR = '/mn-save';
const MININODE_DIR = '/mininode';
/** Autosaves of scores in MiniNode, kept in the account so they survive the tab (hidden folder). */
const AUTOSAVE_FOLDER = '.autosave';

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
function mountData(Module, mn) {
  const { FS, IDBFS } = Module;
  FS.mkdirTree(DATA_DIR);
  FS.mount(IDBFS, {}, DATA_DIR);
  Module.addRunDependency('mn-data');
  FS.syncfs(true, async (error) => {
    if (error) console.warn('musescore: stored data could not be read', error);
    try {
      // Settings from another device win over this browser's older copy; offline or slow, the
      // editor starts with what this browser has.
      const restored = await Promise.race([
        restoreFromAccount(mn, FS, DATA_DIR),
        new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
      ]);
      if (restored) persistData(Module, 0);
    } catch (problem) {
      console.warn('musescore: settings from the account not loaded', problem);
    }
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

/**
 * Where the files the editor writes go, by folder:
 *   /mininode     the person's MiniNode files, under the same name (scores opened from or saved
 *                 to MiniNode live here, so "Save" writes them back and "Open recent" finds them)
 *   /mn-save/<n>  a file on the device the person picked (its handle), or a download
 */
const saveTargets = new Map();
let nextSaveFolder = 1;

const isNativeHandle = (handle) =>
  typeof FileSystemHandle !== 'undefined' && handle instanceof FileSystemHandle;
/** files.js hands out plain objects for MiniNode files; device files are real handles. */
const isMiniNodeHandle = (handle) =>
  !isNativeHandle(handle) && typeof handle.getFile === 'function';

function deviceFolder(Module, target) {
  const folder = `${SAVE_DIR}/${nextSaveFolder++}`;
  Module.FS.mkdirTree(folder);
  saveTargets.set(folder, target);
  return folder;
}

async function openFiles(Module, options) {
  const filters = options.filter.map(parseFilter).filter((f) => f.extensions.length);
  const accept = filters.flatMap((f) => f.extensions);
  const types = accept.length
    ? [{ description: filters[0].description, accept: { 'application/octet-stream': accept } }]
    : undefined;
  const chosen = [];
  if (window.showOpenFilePicker) {
    const handles = await window.showOpenFilePicker({ multiple: options.multiple, types });
    for (const handle of handles) chosen.push({ handle, file: await handle.getFile() });
  } else {
    const files = await new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), {
        type: 'file',
        multiple: options.multiple,
        accept: accept.join(','),
      });
      input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true });
      input.addEventListener('cancel', () => resolve([]), { once: true });
      input.click();
    });
    for (const file of files) chosen.push({ handle: null, file });
  }
  const paths = [];
  for (const { handle, file } of chosen) {
    let folder;
    if (handle && isMiniNodeHandle(handle)) {
      folder = MININODE_DIR;
      keepThumbnail(Module, file.name, file);
    }
    // A device file is saved back into it; without a handle "Save" becomes a download.
    else folder = deviceFolder(Module, { handle, name: file.name });
    Module.FS.mkdirTree(folder);
    const path = `${folder}/${file.name}`;
    writeOwnFile(Module, path, new Uint8Array(await file.arrayBuffer()));
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
  const chosen = handle.name || name;
  if (isMiniNodeHandle(handle)) {
    Module.FS.mkdirTree(MININODE_DIR);
    return `${MININODE_DIR}/${chosen}`;
  }
  return `${deviceFolder(Module, { handle, name: chosen })}/${chosen}`;
}

/** A score from the person's MiniNode files, put where the editor expects it (recent list). */
async function fetchFromMiniNode(Module, path) {
  if (!path.startsWith(`${MININODE_DIR}/`)) return [];
  const name = path.slice(MININODE_DIR.length + 1);
  if (!name || name.includes('/')) return [];
  const mn = await window.mininode.mininode();
  const response = await fetch(await mn.files.url(name));
  if (!response.ok) return [];
  Module.FS.mkdirTree(MININODE_DIR);
  writeOwnFile(Module, path, new Uint8Array(await response.arrayBuffer()));
  return [path];
}

/** Puts the account's autosaves next to the scores in MiniNode (<score>.autosave). */
async function restoreAutosaves(mn, Module) {
  const names = (await mn.files.list(AUTOSAVE_FOLDER)).filter((name) => name.endsWith('.autosave'));
  if (!names.length) return;
  Module.FS.mkdirTree(MININODE_DIR);
  for (const name of names) {
    const response = await fetch(await mn.files.url(`${AUTOSAVE_FOLDER}/${name}`));
    if (response.ok) {
      writeOwnFile(Module, `${MININODE_DIR}/${name}`, new Uint8Array(await response.arrayBuffer()));
    }
  }
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
    const run =
      plain.kind === 'save'
        ? chooseSaveTarget(Module, plain)
        : plain.kind === 'fetch'
          ? fetchFromMiniNode(Module, plain.path)
          : openFiles(Module, plain);
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
  // A restart (graphics fallback, factory settings) is a reload once the user data is stored.
  Module.mnRestart = () => {
    const reload = () => location.reload();
    try {
      Module.FS.syncfs(false, reload);
    } catch {
      reload();
    }
  };
  // File → Print: the editor hands over the score as PDF; a new tab shows it and opens the print dialog.
  Module.mnPrintPdf = (bytes) => {
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }));
    const opened = window.open(url, '_blank');
    if (!opened) window.mnui?.toast(t('print.blocked'));
    else {
      // The tab is this page's own blob: document: open the print dialog right away. If the
      // browser does not allow it, the PDF stays open in its viewer for printing by hand.
      const print = () => {
        try {
          opened.focus();
          opened.print();
        } catch {
          // as above
        }
      };
      try {
        opened.addEventListener('load', () => setTimeout(print, 500), { once: true });
      } catch {
        // as above
      }
    }
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  };
}

// ---- files the editor writes ----------------------------------------------------------------

const pendingSaves = new Map();
/** Files the page itself writes (an opened score) are not handed back. */
let ownWrites = 0;
function writeOwnFile(Module, path, bytes) {
  ownWrites++;
  try {
    Module.FS.writeFile(path, bytes);
  } finally {
    ownWrites--;
  }
}

const download = (blob, name) => {
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: name,
    hidden: true,
  });
  link.dataset.mnNative = ''; // straight to the device, the person chose it already
  document.body.append(link);
  HTMLAnchorElement.prototype.click.call(link);
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
};

/**
 * Keeps the thumbnail of a score in MiniNode in the user data (<data>/thumbnails/<name>.png), so
 * "Zuletzt geöffnet" shows it after a reload and in other browsers before the score is fetched.
 */
function keepThumbnail(Module, name, blob) {
  if (!/\.mscz$/i.test(name)) return;
  readZip(blob)
    .then((files) => {
      const thumbnail = files.find(([entry]) => entry === 'Thumbnails/thumbnail.png')?.[1];
      if (!thumbnail) return;
      Module.FS.mkdirTree(`${DATA_DIR}/thumbnails`);
      Module.FS.writeFile(`${DATA_DIR}/thumbnails/${name}.png`, thumbnail);
      persistData(Module);
    })
    .catch((error) => console.warn('musescore: no thumbnail kept', error));
}

/** Hands a file the editor finished to the place chosen for its folder. */
async function deliver(Module, path) {
  const name = baseName(path);
  const folder = path.slice(0, path.lastIndexOf('/'));
  // MuseScore writes "<name>_saving" first and keeps backups in a hidden ".mscbackup" folder;
  // only the real file leaves the editor.
  if (!name || name.startsWith('.') || name.endsWith('_saving')) return;
  // Autosaves (<score>.autosave) are no files of their own: one of a score in MiniNode goes to the
  // account's hidden autosave folder, one of a file on the device stays in the editor.
  const autosave = name.endsWith('.autosave');
  if (autosave && folder !== MININODE_DIR) return;
  let data;
  try {
    data = Module.FS.readFile(path);
  } catch {
    return; // removed again
  }
  const blob = new Blob([data], { type: 'application/octet-stream' });
  if (folder === MININODE_DIR && autosave) {
    const mn = await window.mininode.mininode();
    await mn.files.upload(`${AUTOSAVE_FOLDER}/${name}`, blob);
    return;
  }
  if (folder === MININODE_DIR) {
    const mn = await window.mininode.mininode();
    await mn.files.upload(name, blob);
    window.mnui?.toast(t('files.save.done', { name }));
    keepThumbnail(Module, name, blob);
    keepVersion(mn, name, blob).catch((error) => console.warn('musescore: no version kept', error));
    return;
  }
  const target = saveTargets.get(folder);
  if (!target) return;
  if (name === target.name && target.handle?.createWritable) {
    const writable = await target.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  // No handle (opened without one), or a further file of one export (parts, pages).
  download(blob, name);
}

/** Watches files the editor closes: saves and exports, and changes to the user data. */
function installWriteHook(Module, dataChanged) {
  const { FS } = Module;
  const isSaved = (path) => path.startsWith(`${SAVE_DIR}/`) || path.startsWith(`${MININODE_DIR}/`);
  /** A file the editor finished at `path`: deliver it a moment later (the last write wins). */
  const finished = (path) => {
    if (isSaved(path) && !ownWrites) {
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
    if (path.startsWith(`${DATA_DIR}/`)) {
      persistData(Module);
      dataChanged(path);
    }
  };
  const close = FS.close;
  FS.close = function closeAndDeliver(stream) {
    const path = stream?.path ?? '';
    const written = Boolean(stream && (stream.flags & 3) !== 0); // O_WRONLY | O_RDWR
    const result = close.call(this, stream);
    if (written) finished(path);
    return result;
  };
  // Qt saves atomically: it writes "<name>.XXXXXX" and renames it to "<name>" when done.
  // An autosave the editor removes (the score was saved, or the changes discarded) leaves the
  // account too.
  const unlink = FS.unlink;
  FS.unlink = function unlinkAndForget(path) {
    const result = unlink.call(this, path);
    const target = String(path);
    if (target.startsWith(`${MININODE_DIR}/`) && target.endsWith('.autosave')) {
      window.mininode
        .mininode()
        .then((mn) => mn.files.remove(`${AUTOSAVE_FOLDER}/${baseName(target)}`))
        .catch((error) => console.warn('musescore: autosave not removed from the account', error));
    }
    return result;
  };
  const rename = FS.rename;
  FS.rename = function renameAndDeliver(oldPath, newPath) {
    const result = rename.call(this, oldPath, newPath);
    finished(String(newPath));
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
        keepQueuedEventTargets(Module);
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
        mountData(instance, mn);
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
        // Autosaves of scores in MiniNode come back before the editor looks for them, so it offers
        // to recover unsaved changes after a closed tab or on another device.
        instance.addRunDependency('mn-autosave');
        Promise.race([
          restoreAutosaves(mn, instance),
          new Promise((resolve) => setTimeout(resolve, 8000)),
        ])
          .catch((error) => console.warn('musescore: autosaves not restored', error))
          .finally(() => instance.removeRunDependency('mn-autosave'));
        // Plugins shared by everyone; without the network the editor starts without them.
        instance.addRunDependency('mn-plugins');
        Promise.race([
          installSharedPlugins(mn, instance.FS),
          new Promise((resolve) => setTimeout(resolve, 10000)),
        ])
          .catch((error) => console.warn('musescore: plugins not loaded', error))
          .finally(() => instance.removeRunDependency('mn-plugins'));
      },
    ],
    onStartApp: async () => {
      // The audio driver needs a user gesture before it may play; it opens on the first click.
      await driver.setup(Module);
      soundFontUrl(build.soundFont)
        .then((url) => {
          Module.soundFont = soundFontUri(url, DEFAULT_SOUNDFONT);
          if (driver.inited) Module.ccall('addSoundFont', '', ['string'], [Module.soundFont]);
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
  installMidi(Module);
  addEventListener(
    'pointerdown',
    () => {
      if (driver.inited) Module._startAudioProcessing();
      else Module.isNeedStartAudio = true;
    },
    { once: true, capture: true },
  );

  const instance = await qtLoad(Module);
  keepQueuedEventTargets(instance);
  const dataChanged = createAccountSync(mn, instance.FS, DATA_DIR);
  installWriteHook(instance, dataChanged);
  installPluginsPanel({ mn, Module: instance });
  // The sound library: SoundFonts and sound effects from the person's and the shared folders.
  const pendingFonts = [];
  const soundFontName = createSoundFontNames();
  const addSoundFont = (url, name) => {
    const uri = soundFontUri(url, soundFontName(name));
    if (driver.inited) instance.ccall('addSoundFont', '', ['string'], [uri]);
    else pendingFonts.push(uri);
  };
  instance.mnFlushSoundFonts = () => {
    for (const uri of pendingFonts.splice(0)) instance.ccall('addSoundFont', '', ['string'], [uri]);
  };
  if (driver.inited) instance.mnFlushSoundFonts();
  installSoundsPanel({ mn, addSoundFont });
  loadSoundLibrary(mn, addSoundFont).catch((error) =>
    console.warn('musescore: sound library not loaded', error),
  );
  installScoresPanel({ mn });
  installDataMenu({
    mn,
    Module: instance,
    dataDir: DATA_DIR,
    persist: () => persistData(instance, 0),
    syncNow: () => dataChanged.now(),
  });
}

start().catch(fail);
