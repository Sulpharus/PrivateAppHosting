// "Daten" in the MiniNode strip: export everything the person keeps in MuseScore as one ZIP file
// and import such a file again (on another device, or after clearing the browser).
//   MuseScore/Scores/<name>   the files in their MiniNode folder of this app (scores, exports)
//   MuseScore/Data/<path>     their MuseScore data from this browser (settings, workspaces, palettes,
//                             plugins: /files/data)
// The ZIP is written uncompressed (scores are compressed already) and read with or without deflate.

const SCORES = 'MuseScore/Scores/';
const DATA = 'MuseScore/Data/';

const t = (key, params = {}) => {
  const text = window.mnI18n?.t(key, params);
  return text && text !== key ? text : key;
};

// ---- ZIP ------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** @param {Array<[string, Uint8Array]>} entries */
export function writeZip(entries) {
  const encoder = new TextEncoder();
  const { time, date } = dosTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/** @returns {Promise<Array<[string, Uint8Array]>>} the files of a ZIP (stored or deflated) */
export async function readZip(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error(t('data.notZip'));
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(position, true) !== 0x02014b50) throw new Error(t('data.notZip'));
    const method = view.getUint16(position + 10, true);
    const compressedSize = view.getUint32(position + 20, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const localOffset = view.getUint32(position + 42, true);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    position += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    const dataStart =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) files.push([name, raw]);
    else if (method === 8) {
      const inflated = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      files.push([name, new Uint8Array(await new Response(inflated).arrayBuffer())]);
    } else throw new Error(t('data.unsupported', { name }));
  }
  return files;
}

// ---- export and import ----------------------------------------------------------------------

/** Every file below `dir` in the editor's file system, with paths relative to it. */
function filesBelow(FS, dir, prefix = '') {
  const out = [];
  for (const name of FS.readdir(dir)) {
    if (name === '.' || name === '..') continue;
    const path = `${dir}/${name}`;
    const stat = FS.stat(path);
    if (FS.isDir(stat.mode)) out.push(...filesBelow(FS, path, `${prefix}${name}/`));
    else out.push([`${prefix}${name}`, FS.readFile(path)]);
  }
  return out;
}

const safeName = (name) =>
  name && !name.split('/').some((part) => part === '..' || part === '') ? name : null;

async function exportAll({ mn, Module, dataDir }, report) {
  const entries = [];
  const names = (await mn.files.list('')).filter((name) => name && !name.startsWith('.'));
  let done = 0;
  for (const name of names) {
    report(t('data.exportingScores', { done, total: names.length }));
    const response = await fetch(await mn.files.url(name));
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    entries.push([`${SCORES}${name}`, new Uint8Array(await response.arrayBuffer())]);
    done++;
  }
  for (const [path, data] of filesBelow(Module.FS, dataDir)) entries.push([`${DATA}${path}`, data]);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(writeZip(entries)),
    download: `MuseScore-${stamp}.zip`,
    hidden: true,
  });
  link.dataset.mnNative = ''; // straight to the device, not the MiniNode save dialog
  document.body.append(link);
  HTMLAnchorElement.prototype.click.call(link);
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  return { scores: names.length };
}

async function importAll({ mn, Module, dataDir, persist }, file, report) {
  const files = await readZip(file);
  const scores = files.filter(([name]) => name.startsWith(SCORES));
  const data = files.filter(([name]) => name.startsWith(DATA));
  if (!scores.length && !data.length) throw new Error(t('data.empty'));
  let done = 0;
  for (const [name, bytes] of scores) {
    report(t('data.importingScores', { done, total: scores.length }));
    const target = safeName(name.slice(SCORES.length));
    if (target) await mn.files.upload(target, new Blob([bytes]));
    done++;
  }
  for (const [name, bytes] of data) {
    const target = safeName(name.slice(DATA.length));
    if (!target) continue;
    const path = `${dataDir}/${target}`;
    Module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    Module.FS.writeFile(path, bytes);
  }
  if (data.length) persist();
  return { scores: scores.length, settings: data.length > 0 };
}

// ---- dialog ---------------------------------------------------------------------------------

export function installDataMenu(context) {
  const button = document.getElementById('mn-data');
  if (!button) return;
  button.hidden = false;
  button.addEventListener('click', () => {
    const sheet = document.createElement('div');
    sheet.className = 'mn-data';
    sheet.innerHTML = `
      <h2></h2>
      <p class="mn-data-intro"></p>
      <p class="mn-data-status" role="status" aria-live="polite"></p>
      <div class="mn-data-actions">
        <button type="button" class="mn-btn mn-btn--ghost" data-mn-close></button>
        <span class="mn-grow"></span>
        <button type="button" class="mn-btn" data-action="import"></button>
        <button type="button" class="mn-btn mn-btn--primary" data-action="export"></button>
      </div>
      <input type="file" accept=".zip,application/zip" hidden data-mn-native>`;
    sheet.querySelector('h2').textContent = t('data.title');
    sheet.querySelector('.mn-data-intro').textContent = t('data.intro');
    sheet.querySelector('[data-mn-close]').textContent = t('data.close');
    sheet.querySelector('[data-action="import"]').textContent = t('data.import');
    sheet.querySelector('[data-action="export"]').textContent = t('data.export');
    const statusLine = sheet.querySelector('.mn-data-status');
    const buttons = [...sheet.querySelectorAll('[data-action]')];
    const busy = (on) => {
      for (const b of buttons) b.disabled = on;
    };
    const run = async (work) => {
      busy(true);
      try {
        statusLine.textContent = await work((text) => (statusLine.textContent = text));
      } catch (error) {
        console.error('musescore: data', error);
        statusLine.textContent = t('data.failed', { message: error?.message ?? String(error) });
      } finally {
        busy(false);
      }
    };
    sheet.querySelector('[data-action="export"]').addEventListener('click', () =>
      run(async (report) => {
        report(t('data.exporting'));
        const { scores } = await exportAll(context, report);
        return t('data.exported', { scores });
      }),
    );
    const input = sheet.querySelector('input[type="file"]');
    sheet.querySelector('[data-action="import"]').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      run(async (report) => {
        report(t('data.importing'));
        const { scores, settings } = await importAll(context, file, report);
        return settings ? t('data.importedReload', { scores }) : t('data.imported', { scores });
      });
    });
    window.mnui.sheet.open(sheet, { label: t('data.title') });
  });
}
