// Small pieces between the page and the editor (Qt for WebAssembly, MuseScore's audio engine).
// Tested by test/glue.test.js.

/** The SoundFont the editor plays by default; its file name is how the editor asks for it. */
export const DEFAULT_SOUNDFONT = 'MS Basic.sf3';

/**
 * Names for SoundFonts in the engine. The engine stores each one under its file name, so two
 * fonts with the same name would overwrite each other ("Piano.sf2" in a private and a shared
 * folder, or a library font called like the default): later ones get " (2)", " (3)" ….
 */
export function createSoundFontNames() {
  const used = new Set([DEFAULT_SOUNDFONT.toLowerCase()]);
  return (name) => {
    const clean = name.replaceAll('/', '-');
    const dot = clean.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
    let candidate = clean;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
}

/**
 * A SoundFont for the editor: MuseScore's Uri keeps only scheme://path, so blob:… is passed as
 * blob://…; its web loader turns it back into blob: and drops the file name after the last "/"
 * (patches/mininode.patch, NetworkSFLoader). The engine names the SoundFont after that file name.
 * Not for a page with an opaque origin (blob:null/…): the loader needs scheme://host.
 */
export const soundFontUri = (url, name) =>
  `${url.replace(/^blob:/, 'blob://')}/${encodeURIComponent(name.replaceAll('/', '-'))}`;

/**
 * Qt queues browser events while the editor waits (a file dialog suspends it) and handles them
 * later. By then the browser has cleared `target` of events inside Qt's shadow root, and Qt
 * reads it (pointer enter, move, wheel: "Cannot read properties of null"), which aborts what the
 * editor was doing, e.g. opening the chosen file. The target is kept on the event when queued.
 */
export function keepQueuedEventTargets(Module) {
  const queue = Module.qtSuspendResumeControl?.pendingEvents;
  if (!Array.isArray(queue) || queue.push !== Array.prototype.push) return;
  queue.push = function pushKeepingTargets(...items) {
    for (const item of items) {
      const event = item?.arg;
      if (event instanceof Event && event.target) {
        Object.defineProperty(event, 'target', { value: event.target, configurable: true });
      }
    }
    return Array.prototype.push.apply(this, items);
  };
}
