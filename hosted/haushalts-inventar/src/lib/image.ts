/**
 * Photos from a phone are 3 to 4 MB and 4000 px wide. Showing that in a tile costs memory and
 * decoding time on every scroll, so the app stores a 1280 px picture for the detail view and a
 * 480 px one for tiles and lists. Receipts keep their size (text must stay readable), only
 * oversized ones are scaled to 2400 px.
 */

const SHRINKABLE = /^image\/(jpeg|png|webp|avif|heic|heif)$/i;

/** The picture scaled to fit `maxSide`, as a JPEG; the original when it cannot or need not be scaled. */
export async function shrinkImage(file: File, maxSide: number, quality = 0.82): Promise<Blob> {
  if (!SHRINKABLE.test(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    // Already small: keep the file unless it is heavy.
    if (scale === 1 && file.size < 400 * 1024) {
      bitmap.close();
      return file;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
