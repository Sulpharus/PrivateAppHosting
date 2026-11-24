import { describe, expect, it } from 'vitest';
import { zipRows } from './exports.ts';

const run = (id: number, title: string, conclusion: string | null = 'success') => ({
  id,
  status: conclusion ? 'completed' : 'in_progress',
  conclusion,
  html_url: `https://github.com/me/platform/actions/runs/${id}`,
  created_at: `2026-11-2${id}T10:00:00Z`,
  display_title: title,
});
const artifact = (id: number, runId: number, name: string, expired = false) => ({
  id,
  name,
  size_in_bytes: 2048,
  expired,
  expires_at: '2026-12-01T00:00:00Z',
  workflow_run: { id: runId },
});

describe('zipRows', () => {
  it('lists ZIP exports only, newest first, with their file while GitHub keeps it', () => {
    const rows = zipRows(
      [
        run(1, 'App als ZIP notes'),
        run(2, 'App als GitHub-Projekt notes'),
        run(3, 'App als ZIP sudoku', null),
        run(4, 'App als ZIP kalender', 'failure'),
        run(5, 'App als ZIP haushalt'),
      ],
      [
        artifact(10, 1, 'mininode-app-notes-2026-11-21'),
        artifact(11, 2, 'export'),
        artifact(12, 5, 'mininode-app-haushalt-2026-11-25', true),
      ],
    );
    expect(rows.map((row) => [row.slug, row.state])).toEqual([
      ['haushalt', 'expired'],
      ['kalender', 'failed'],
      ['sudoku', 'running'],
      ['notes', 'ready'],
    ]);
    expect(rows.find((row) => row.slug === 'notes')?.artifact).toMatchObject({
      id: 10,
      sizeBytes: 2048,
    });
    expect(rows.find((row) => row.slug === 'haushalt')?.artifact).toBeNull();
  });
});
