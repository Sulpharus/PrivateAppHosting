// Usage: node sf2-check.mjs out.sf2, then parse it (e.g. Python sf2utils + audioop-lts).
// Builds a SoundFont with web/mn-sf2.js from two synthetic sounds (mono and stereo) and writes it.
import { writeFileSync } from 'node:fs';
import { buildSoundFont } from '../web/mn-sf2.js';

const rate = 44100;
const tone = (hz, secs) =>
  Float32Array.from(
    { length: rate * secs },
    (_, i) => Math.sin((2 * Math.PI * hz * i) / rate) * Math.exp((-3 * i) / rate),
  );
const font = buildSoundFont('Effekte', [
  { name: 'Donner', key: 60, rate, channels: [tone(110, 1)] },
  { name: 'Glocke', key: 61, rate, channels: [tone(880, 1), tone(880, 1)] },
]);
writeFileSync(process.argv[2], font);
console.log('bytes', font.length);
