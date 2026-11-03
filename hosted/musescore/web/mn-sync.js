// The person's MuseScore data (/files/data: settings, workspaces, palettes, plugins, recent list)
// follows them to every browser they sign in on. Each browser keeps its own copy in IndexedDB and
// starts from it; the account holds a snapshot as well:
//   - `.musescore-data.zip` in their MiniNode files of this app (hidden from the file dialogs),
//   - its stamp in mn.kv (`dataStamp`: { id, at }).
// Before the editor starts, a snapshot newer than this browser's copy (another stamp) replaces it.
// After a change the snapshot is written again, a little later and only when the data changed.
import { filesBelow, readZip, safeName, writeZip } from './mn-data.js';

const SNAPSHOT = '.musescore-data.zip';
const STAMP_FILE = '.mn-stamp';
const STAMP_KEY = 'dataStamp';

const decoder = new TextDecoder();

function localStamp(FS, dataDir) {
  try {
    return decoder.decode(FS.readFile(`${dataDir}/${STAMP_FILE}`));
  } catch {
    return '';
  }
}

/** The data without the stamp, sorted, and a digest of it (to skip uploads that change nothing). */
function snapshotOf(FS, dataDir) {
  const entries = filesBelow(FS, dataDir)
    .filter(([path]) => path !== STAMP_FILE)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let digest = 2166136261;
  for (const [path, data] of entries) {
    for (const byte of new TextEncoder().encode(path)) digest = Math.imul(digest ^ byte, 16777619);
    for (const byte of data) digest = Math.imul(digest ^ byte, 16777619);
  }
  return { entries, digest: `${entries.length}:${(digest >>> 0).toString(16)}` };
}

function clear(FS, dir) {
  for (const name of FS.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    const path = `${dir}/${name}`;
    if (FS.isDir(FS.stat(path).mode)) {
      clear(FS, path);
      FS.rmdir(path);
    } else FS.unlink(path);
  }
}

/**
 * Replaces this browser's data by the account's snapshot when that one is from elsewhere.
 * @returns {Promise<boolean>} whether the data was replaced
 */
export async function restoreFromAccount(mn, FS, dataDir) {
  const remote = await mn.kv.get(STAMP_KEY);
  if (!remote?.id || remote.id === localStamp(FS, dataDir)) return false;
  const response = await fetch(await mn.files.url(SNAPSHOT));
  if (!response.ok) return false;
  const files = await readZip(await response.blob());
  clear(FS, dataDir);
  for (const [name, data] of files) {
    const target = safeName(name);
    if (!target) continue;
    const path = `${dataDir}/${target}`;
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    FS.writeFile(path, data);
  }
  FS.writeFile(`${dataDir}/${STAMP_FILE}`, remote.id);
  return true;
}

/** Returns `changed(path)`, to call for each file written below dataDir. */
export function createAccountSync(mn, FS, dataDir, delay = 15_000) {
  let last = snapshotOf(FS, dataDir).digest;
  let timer = 0;
  let running = false;
  let again = false;

  async function upload() {
    const { entries, digest } = snapshotOf(FS, dataDir);
    if (digest === last) return;
    await mn.files.upload(SNAPSHOT, writeZip(entries), { contentType: 'application/zip' });
    const stamp = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      at: new Date().toISOString(),
    };
    await mn.kv.set(STAMP_KEY, stamp);
    FS.writeFile(`${dataDir}/${STAMP_FILE}`, stamp.id);
    last = digest;
  }

  function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    upload()
      .catch((error) => console.warn('musescore: settings not stored in the account', error))
      .finally(() => {
        running = false;
        if (again) {
          again = false;
          schedule();
        }
      });
  }

  function schedule(wait = delay) {
    clearTimeout(timer);
    timer = setTimeout(run, wait);
  }

  addEventListener('pagehide', () => {
    if (timer) run();
  });

  const changed = (path) => {
    if (path.endsWith(`/${STAMP_FILE}`)) return;
    schedule();
  };
  /** Stores the data in the account right away (after an import). */
  changed.now = async () => {
    clearTimeout(timer);
    timer = 0;
    while (running) await new Promise((resolve) => setTimeout(resolve, 100));
    await upload();
  };
  return changed;
}
