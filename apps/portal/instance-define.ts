import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Build-time constants from mininode.config.json at the repository root (see src/lib/instance.ts). */
export function instanceDefines(): Record<string, string> {
  const file = join(import.meta.dirname, '../../mininode.config.json');
  let repository = '';
  if (existsSync(file)) {
    const config = JSON.parse(readFileSync(file, 'utf8')) as { github?: { repository?: string } };
    repository = config.github?.repository ?? '';
  }
  return { __GITHUB_REPOSITORY__: JSON.stringify(repository) };
}
