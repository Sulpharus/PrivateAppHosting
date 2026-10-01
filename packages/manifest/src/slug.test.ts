import { describe, expect, it } from 'vitest';
import { programName, slugify } from './slug.ts';

describe('slugify', () => {
  it('makes addresses', () => {
    expect(slugify('Mein Versicherungs-Manager!')).toBe('mein-versicherungs-manager');
    expect(slugify('Übung 2')).toBe('ubung-2');
    expect(slugify('123 Rechner')).toBe('app-123-rechner');
    expect(slugify('!!!')).toBe('');
  });
});

describe('programName', () => {
  it('drops setup noise from installer names', () => {
    expect(programName('Notepad++-Setup-8.6.2-x64.exe')).toBe('Notepad++');
    expect(programName('VLC_win64_installer.msi')).toBe('VLC');
    expect(programName('setup.exe')).toBe('setup');
  });
});
