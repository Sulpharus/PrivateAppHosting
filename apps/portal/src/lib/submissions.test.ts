import { describe, expect, it } from 'vitest';
import { formatSize, isRunning, reviewPrompt, type Submission } from './submissions.ts';

const row: Submission = {
  id: '12345678-aaaa-bbbb-cccc-1234567890ab',
  kind: 'webapp',
  filename: 'sentinel.zip',
  size_bytes: 1,
  status: 'needs_review',
  slug: 'sentinel',
  name: 'Sentinel',
  summary: { reasons: [{ code: 'own_backend', message: 'Server', file: 'server.ts' }] },
  log: 'Bericht',
  run_url: null,
  pr_url: null,
  review_url: 'https://github.com/o/r/issues/4',
  created_at: '2026-10-01T10:00:00Z',
};

describe('reviewPrompt', () => {
  it('names the file, the reasons and where the ZIP is', () => {
    const text = reviewPrompt(row);
    expect(text).toContain('sentinel.zip');
    expect(text).toContain('own_backend (server.ts): Server');
    expect(text).toContain('review/12345678');
  });

  it('points programs to the installer playbook', () => {
    const text = reviewPrompt({ ...row, kind: 'program', filename: 'x.exe', review_url: null });
    expect(text).toContain('native-installer.md');
    expect(text).toContain('installers/sentinel/x.exe');
  });
});

describe('helpers', () => {
  it('knows which states are still moving', () => {
    expect(isRunning('integrating')).toBe(true);
    expect(isRunning('needs_review')).toBe(false);
  });

  it('formats sizes the German way', () => {
    expect(formatSize(2_500_000)).toBe('2,4 MB');
    expect(formatSize(100)).toBe('1 KB');
  });
});
