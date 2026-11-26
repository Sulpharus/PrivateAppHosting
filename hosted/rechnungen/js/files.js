// Attachments and the logo in mn.files: pictures are scaled on a canvas (1600 px, quality 0.84,
// plus a 640 px thumbnail), PDFs go up as they are. Signed URLs are turned into blob: URLs once per
// session, at most four at a time.
import { app } from './ctx.js';

export const MAX_BYTES = 20 * 1024 * 1024;
export const ACCEPT = 'image/*,application/pdf';

export function acceptable(file) {
  if (file.size > MAX_BYTES) return 'tooBig';
  if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) return 'type';
  return null;
}

async function scaled(file, max, quality = 0.84, background = null) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (background) {
    // JPEG has no transparency: logos get a white page colour behind them, like the paper.
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** Uploads an attachment of an invoice; returns { path, thumb, name, type, size }. */
export async function uploadAttachment(invoiceId, file) {
  const id = crypto.randomUUID();
  const base = `anhaenge/${invoiceId}/${id}`;
  if (file.type.startsWith('image/')) {
    const [big, small] = await Promise.all([scaled(file, 1600), scaled(file, 640)]);
    await app.mn.files.upload(`${base}.jpg`, big, { contentType: 'image/jpeg' });
    await app.mn.files.upload(`${base}-thumb.jpg`, small, { contentType: 'image/jpeg' });
    return {
      path: `${base}.jpg`,
      thumb: `${base}-thumb.jpg`,
      name: file.name.slice(0, 120),
      type: 'image/jpeg',
      size: big.size,
    };
  }
  await app.mn.files.upload(`${base}.pdf`, file, { contentType: 'application/pdf' });
  return {
    path: `${base}.pdf`,
    thumb: null,
    name: file.name.slice(0, 120),
    type: 'application/pdf',
    size: file.size,
  };
}

/** Uploads the company logo as a JPEG on white (the PDF writer embeds JPEG). */
export async function uploadLogo(file) {
  // The paper colour of the invoice, not a UI colour.
  const blob = await scaled(file, 800, 0.9, '#ffffff');
  const path = `logo/${crypto.randomUUID()}.jpg`;
  await app.mn.files.upload(path, blob, { contentType: 'image/jpeg' });
  return path;
}

export async function removeFiles(paths) {
  for (const path of paths.filter(Boolean)) {
    try {
      await app.mn.files.remove(path);
    } catch {
      // Already gone.
    }
  }
}

const urls = new Map();
let running = 0;
const waiting = [];
function slot() {
  if (running < 4) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve)).then(() => {
    running += 1;
  });
}
function release() {
  running -= 1;
  waiting.shift()?.();
}

/** A blob: URL for a stored file (cached for the session). */
export function blobUrl(path) {
  if (!urls.has(path)) {
    urls.set(
      path,
      (async () => {
        await slot();
        try {
          const signed = await app.mn.files.url(path);
          const res = await fetch(signed);
          if (!res.ok) throw new Error(String(res.status));
          return URL.createObjectURL(await res.blob());
        } finally {
          release();
        }
      })().catch((error) => {
        urls.delete(path);
        throw error;
      }),
    );
  }
  return urls.get(path);
}

/** Opens a stored file in a new tab via its signed URL. */
export async function openStored(path) {
  const win = blankWindow();
  const url = await app.mn.files.url(path);
  if (win) win.location.href = url;
  else window.location.assign(url);
}

/** A new tab opened right in the click (before any await), so pop-up blockers let it through. */
export function blankWindow() {
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  return win;
}
