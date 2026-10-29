import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
}

/** `supabase/migrations/<version>_<name>.sql` in version order. */
export function readMigrations(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((file) => /^\d{14}_[\w-]+\.sql$/.test(file))
    .sort()
    .map((file) => {
      const [version = '', ...rest] = file.replace(/\.sql$/, '').split('_');
      return { version, name: rest.join('_'), sql: readFileSync(join(dir, file), 'utf8') };
    });
}

export const appliedMigrations = (versions: string[]): Set<string> => new Set(versions);

/** The files that have not run yet, in order. */
export function migrationsToRun(files: MigrationFile[], done: Set<string>): MigrationFile[] {
  return files.filter((file) => !done.has(file.version));
}
