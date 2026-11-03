// Builds a SoundFont 2 file from decoded audio: one instrument with one key per sound, the
// recording played at its original pitch and length (no loop). MuseScore plays SoundFonts, so a
// folder of sound effects becomes an instrument for the mixer: write a note on the effect's key.
// Stereo sounds become a linked left/right pair. Format: SoundFont 2.01 (RIFF "sfbk").

const ascii = (text, length) => {
  const out = new Uint8Array(length);
  const clean = String(text)
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .slice(0, length - 1);
  for (let i = 0; i < clean.length; i++) out[i] = clean.charCodeAt(i);
  return out;
};

class Writer {
  constructor() {
    this.parts = [];
    this.size = 0;
  }
  bytes(data) {
    this.parts.push(data);
    this.size += data.length;
  }
  u8(...values) {
    this.bytes(Uint8Array.from(values));
  }
  u16(value) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, value, true);
    this.bytes(b);
  }
  i16(value) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, value, true);
    this.bytes(b);
  }
  u32(value) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, value, true);
    this.bytes(b);
  }
  tag(id) {
    this.bytes(ascii(id, 5).subarray(0, 4));
  }
  concat() {
    const out = new Uint8Array(this.size);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

const chunk = (id, body) => {
  const w = new Writer();
  w.tag(id);
  w.u32(body.length);
  w.bytes(body);
  if (body.length % 2) w.u8(0);
  return w.concat();
};
const list = (id, ...chunks) => {
  const w = new Writer();
  w.tag(id);
  for (const c of chunks) w.bytes(c);
  return chunk('LIST', w.concat());
};

// Generator numbers (SoundFont 2.01, section 8.1.2).
const GEN = { pan: 17, instrument: 41, keyRange: 43, sampleID: 53, sampleModes: 54, rootKey: 58 };
const PAD = 46; // zero samples after each sample, as the format asks

/**
 * @param {string} name  preset and instrument name (the folder)
 * @param {Array<{ name: string, key: number, rate: number, channels: Float32Array[] }>} sounds
 * @returns {Uint8Array} the .sf2 file
 */
export function buildSoundFont(name, sounds) {
  // Sample data and headers.
  const samples = []; // { name, start, end, rate, key, link, type }
  const pcm = new Writer();
  let position = 0;
  const addSample = (label, data, rate, key) => {
    const start = position;
    for (let i = 0; i < data.length; i++) {
      const v = Math.max(-1, Math.min(1, data[i]));
      pcm.i16(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff));
    }
    for (let i = 0; i < PAD; i++) pcm.i16(0);
    position += data.length + PAD;
    samples.push({ name: label, start, end: start + data.length, rate, key, link: 0, type: 1 });
    return samples.length - 1;
  };
  const zones = []; // { key, sample, pan }
  for (const sound of sounds) {
    const [left, right] = sound.channels;
    if (right) {
      const l = addSample(`${sound.name} L`, left, sound.rate, sound.key);
      const r = addSample(`${sound.name} R`, right, sound.rate, sound.key);
      Object.assign(samples[l], { type: 4, link: r }); // leftSample
      Object.assign(samples[r], { type: 2, link: l }); // rightSample
      zones.push({ key: sound.key, sample: l, pan: -500 }, { key: sound.key, sample: r, pan: 500 });
    } else {
      zones.push({
        key: sound.key,
        sample: addSample(sound.name, left, sound.rate, sound.key),
        pan: 0,
      });
    }
  }

  // INFO
  const ifil = new Writer();
  ifil.u16(2);
  ifil.u16(1);
  const info = list(
    'INFO',
    chunk('ifil', ifil.concat()),
    chunk('isng', ascii('EMU8000', 8)),
    chunk('INAM', ascii(name, Math.min(256, name.length + 2 + (name.length % 2)))),
    chunk('ISFT', ascii('MiniNode MuseScore', 20)),
  );
  const sdta = list('sdta', chunk('smpl', pcm.concat()));

  // Preset: one zone pointing at instrument 0.
  const phdr = new Writer();
  phdr.bytes(ascii(name, 20));
  phdr.u16(0); // preset number
  phdr.u16(0); // bank
  phdr.u16(0); // first bag
  phdr.u32(0);
  phdr.u32(0);
  phdr.u32(0);
  phdr.bytes(ascii('EOP', 20));
  phdr.u16(0);
  phdr.u16(0);
  phdr.u16(1);
  phdr.u32(0);
  phdr.u32(0);
  phdr.u32(0);
  const pbag = new Writer();
  pbag.u16(0);
  pbag.u16(0);
  pbag.u16(1);
  pbag.u16(0);
  const pmod = new Writer();
  for (let i = 0; i < 10; i++) pmod.u8(0);
  const pgen = new Writer();
  pgen.u16(GEN.instrument);
  pgen.u16(0);
  pgen.u16(0);
  pgen.u16(0);

  // Instrument: one zone per sample (two per stereo sound).
  const inst = new Writer();
  inst.bytes(ascii(name, 20));
  inst.u16(0);
  inst.bytes(ascii('EOI', 20));
  inst.u16(zones.length);
  const ibag = new Writer();
  const igen = new Writer();
  let generators = 0;
  for (const zone of zones) {
    ibag.u16(generators);
    ibag.u16(0);
    igen.u16(GEN.keyRange);
    igen.u8(zone.key, zone.key);
    generators++;
    if (zone.pan) {
      igen.u16(GEN.pan);
      igen.i16(zone.pan);
      generators++;
    }
    igen.u16(GEN.sampleModes);
    igen.u16(0);
    generators++;
    igen.u16(GEN.rootKey);
    igen.u16(zone.key);
    generators++;
    igen.u16(GEN.sampleID); // must be last in the zone
    igen.u16(zone.sample);
    generators++;
  }
  ibag.u16(generators);
  ibag.u16(0);
  igen.u16(0);
  igen.u16(0);
  const imod = new Writer();
  for (let i = 0; i < 10; i++) imod.u8(0);

  const shdr = new Writer();
  for (const s of samples) {
    shdr.bytes(ascii(s.name, 20));
    shdr.u32(s.start);
    shdr.u32(s.end);
    // Not looped (sampleModes 0), but loop points inside the sample as the format expects.
    const roomy = s.end - s.start > 32;
    shdr.u32(roomy ? s.start + 8 : s.start);
    shdr.u32(roomy ? s.end - 8 : s.end);
    shdr.u32(s.rate);
    shdr.u8(s.key, 0);
    shdr.u16(s.link);
    shdr.u16(s.type);
  }
  shdr.bytes(ascii('EOS', 20));
  for (let i = 0; i < 5; i++) shdr.u32(0);
  shdr.u8(0, 0);
  shdr.u16(0);
  shdr.u16(0);

  const pdta = list(
    'pdta',
    chunk('phdr', phdr.concat()),
    chunk('pbag', pbag.concat()),
    chunk('pmod', pmod.concat()),
    chunk('pgen', pgen.concat()),
    chunk('inst', inst.concat()),
    chunk('ibag', ibag.concat()),
    chunk('imod', imod.concat()),
    chunk('igen', igen.concat()),
    chunk('shdr', shdr.concat()),
  );

  const body = new Writer();
  body.tag('sfbk');
  body.bytes(info);
  body.bytes(sdta);
  body.bytes(pdta);
  return chunk('RIFF', body.concat());
}

/** Decodes an audio file (WAV, MP3, OGG, FLAC, M4A …) to 44.1 kHz float channels (at most two). */
export async function decodeAudio(blob) {
  const context = new OfflineAudioContext(2, 1, 44100);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const channels = [buffer.getChannelData(0)];
  if (buffer.numberOfChannels > 1) channels.push(buffer.getChannelData(1));
  return { rate: buffer.sampleRate, channels };
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
/** 60 → "C4" */
export const keyName = (key) => `${NOTE_NAMES[key % 12]}${Math.floor(key / 12) - 1}`;
/** The first sound sits on middle C; one key further for each sound. */
export const FIRST_KEY = 60;
