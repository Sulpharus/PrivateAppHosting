// The page's Web MIDI glue (web/mn-midi.js).
import { describe, expect, it } from 'vitest';
import { deviceList, midiPackage } from '../web/mn-midi.js';

describe('midiPackage', () => {
  it('packs status and data bytes like the desktop ports', () => {
    expect(midiPackage(Uint8Array.of(0x90, 60, 100))).toBe(0x90 | (60 << 8) | (100 << 16));
    expect(midiPackage(Uint8Array.of(0xc3, 5))).toBe(0xc3 | (5 << 8));
  });

  it('drops SysEx, real-time and stray data bytes', () => {
    expect(midiPackage(Uint8Array.of(0xf0, 1, 2, 0xf7))).toBeNull();
    expect(midiPackage(Uint8Array.of(0xf8))).toBeNull();
    expect(midiPackage(Uint8Array.of(0x40))).toBeNull();
    expect(midiPackage(new Uint8Array())).toBeNull();
  });
});

describe('deviceList', () => {
  it('lists connected inputs as id and name, one per line', () => {
    const inputs = [
      { id: 'a1', name: 'Piano\tKeys', state: 'connected' },
      { id: 'b2', name: '', state: 'connected' },
      { id: 'c3', name: 'Gone', state: 'disconnected' },
    ];
    expect(deviceList(inputs)).toBe('a1\tPiano Keys\nb2\tb2');
  });
});
