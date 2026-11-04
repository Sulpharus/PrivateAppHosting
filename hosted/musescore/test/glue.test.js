// The page's glue to the editor (web/mn-glue.js).
import { describe, expect, it } from 'vitest';
import {
  createSoundFontNames,
  DEFAULT_SOUNDFONT,
  keepQueuedEventTargets,
  soundFontUri,
} from '../web/mn-glue.js';

/** muse::Uri: scheme up to ":", path after "://" (framework/global/types/uri.cpp). */
const parseUri = (uri) => ({
  scheme: uri.slice(0, uri.indexOf(':')),
  path: uri.slice(uri.indexOf('://') + 3),
});
/** NetworkSFLoader in patches/mininode.patch: the address it fetches. */
const fetched = (uri) => {
  const { scheme, path } = parseUri(uri);
  if (scheme !== 'blob') return uri;
  const host = path.indexOf('//');
  const hostEnd = host === -1 ? -1 : path.indexOf('/', host + 2);
  const last = path.lastIndexOf('/');
  return `blob:${hostEnd !== -1 && last > hostEnd ? path.slice(0, last) : path}`;
};
/** SoundFontRepository: the file name (percent-decoded last segment) names the font. */
const fileName = (uri) => decodeURIComponent(parseUri(uri).path.split('/').pop());

describe('soundFontUri', () => {
  const blob = 'blob:https://musescore.example.org/5f0c2a4e-1b7d-4c55-9a77-0d1e2f3a4b5c';

  it('fetches the blob and names the font after the file', () => {
    const uri = soundFontUri(blob, DEFAULT_SOUNDFONT);
    expect(fetched(uri)).toBe(blob);
    expect(fileName(uri)).toBe('MS Basic.sf3');
  });

  it('keeps names with spaces, ?, # and / intact as one segment', () => {
    const uri = soundFontUri(blob, 'Drums #1? a/b.sf2');
    expect(fetched(uri)).toBe(blob);
    expect(fileName(uri)).toBe('Drums #1? a-b.sf2');
  });

  it('leaves an address without a file name as it is', () => {
    expect(fetched(blob.replace('blob:', 'blob://'))).toBe(blob);
  });
});

describe('createSoundFontNames', () => {
  it('keeps names unique and never takes the default', () => {
    const name = createSoundFontNames();
    expect(name('Piano.sf2')).toBe('Piano.sf2');
    expect(name('piano.SF2')).toBe('piano (2).SF2');
    expect(name('Piano.sf2')).toBe('Piano (3).sf2');
    expect(name('MS Basic.sf3')).toBe('MS Basic (2).sf3');
    expect(name('Effekte')).toBe('Effekte');
  });
});

describe('keepQueuedEventTargets', () => {
  it('keeps the target of a queued event after the browser clears it', () => {
    const Module = { qtSuspendResumeControl: { pendingEvents: [] } };
    keepQueuedEventTargets(Module);
    keepQueuedEventTargets(Module); // once only
    const element = new EventTarget();
    let queued;
    element.addEventListener('pointerenter', (event) => {
      Module.qtSuspendResumeControl.pendingEvents.push({ index: 1, arg: event });
      queued = event;
    });
    element.dispatchEvent(new Event('pointerenter'));
    expect(Object.getOwnPropertyDescriptor(queued, 'target')?.value).toBe(element);
    expect(Module.qtSuspendResumeControl.pendingEvents.shift()?.arg.target).toBe(element);
  });
});
