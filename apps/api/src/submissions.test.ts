import { describe, expect, it } from 'vitest';
import type { ApiEnv } from './env.ts';
import { app } from './index.ts';
import { guessProgramPath, safeFilename, validProgramPath } from './routes/submissions.ts';

describe('upload helpers', () => {
  it('cleans file names for storage paths and command lines', () => {
    expect(safeFilename('C:\\Users\\x\\Setup 1.0 (x64).exe')).toBe('Setup_1.0_x64_.exe');
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('')).toBe('upload');
  });

  it('guesses the usual install folder', () => {
    expect(guessProgramPath('Notepad++')).toBe('C:\\Program Files\\Notepad++\\Notepad++.exe');
    expect(guessProgramPath('A:b"c')).toBe('C:\\Program Files\\Abc\\Abc.exe');
  });

  it('refuses program paths that could break out of a PowerShell string', () => {
    expect(validProgramPath('C:\\Program Files\\App\\app.exe')).toBe(true);
    for (const bad of ['', 'C:\\a"b', 'C:\\a\nb', 'C:\\a\u2019b', 'x'.repeat(300)])
      expect(validProgramPath(bad)).toBe(false);
  });
});

describe('CORS for uploads', () => {
  it('lets the portal send the upload headers', async () => {
    const response = await app.request(
      '/admin/submissions',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://mininode.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers':
            'authorization,x-filename,x-runtime,x-slug,x-program,x-silent-args',
        },
      },
      { PORTAL_URL: 'https://mininode.app' } as unknown as ApiEnv,
    );
    const allowed = (response.headers.get('Access-Control-Allow-Headers') ?? '').toLowerCase();
    for (const header of ['x-filename', 'x-runtime', 'x-slug', 'x-program', 'x-silent-args'])
      expect(allowed).toContain(header);
  });
});
