// MuseScore's shared program files (templates, instruments, styles, workspaces, the German and
// English translations …) arrive as one gzip archive written by build.mjs:
//   [4 bytes: index length, little endian][index: JSON [[path, size], …]][the files, in order]
// One request instead of hundreds; the browser unpacks it with DecompressionStream.

/**
 * @param {{ file: string, size: number }} options  archive name and unpacked size (for progress)
 * @param {(value: number) => void} onProgress  0 … 1
 * @returns {Promise<Array<[string, Uint8Array]>>}
 */
export async function unpackShare(options, onProgress) {
  const response = await fetch(new URL(options.file, import.meta.url));
  if (!response.ok || !response.body) throw new Error(`${options.file}: ${response.status}`);
  const reader = response.body.pipeThrough(new DecompressionStream('gzip')).getReader();
  const archive = new Uint8Array(options.size);
  let offset = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.length > archive.length)
      throw new Error('share archive is larger than announced');
    archive.set(value, offset);
    offset += value.length;
    onProgress(offset / archive.length);
  }
  if (offset !== archive.length) throw new Error('share archive is incomplete');

  const view = new DataView(archive.buffer);
  const indexLength = view.getUint32(0, true);
  const index = JSON.parse(new TextDecoder().decode(archive.subarray(4, 4 + indexLength)));
  const files = [];
  let position = 4 + indexLength;
  for (const [path, size] of index) {
    files.push([path, archive.subarray(position, position + size)]);
    position += size;
  }
  return files;
}
