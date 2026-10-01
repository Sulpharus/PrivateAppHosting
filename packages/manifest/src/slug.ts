/** `Mein Versicherungs-Manager!` → `mein-versicherungs-manager` (2–32 chars, letter first). */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const letterFirst = /^[a-z]/.test(slug) ? slug : slug ? `app-${slug}` : '';
  return letterFirst.slice(0, 32).replace(/-+$/g, '');
}

const INSTALLER_NOISE =
  /^(setup|installer|install|win|win32|win64|windows|x64|x86|amd64|64bit|32bit|msi|exe|portable|v?\d[\d.]*)$/i;

/** `Notepad++-Setup-8.6.2-x64.exe` → `Notepad++`; falls back to the file name without extension. */
export function programName(filename: string): string {
  const base = filename.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const words = base.split(/[-_ ]+/).filter((word) => word && !INSTALLER_NOISE.test(word));
  return (words.join(' ') || base).slice(0, 40);
}
