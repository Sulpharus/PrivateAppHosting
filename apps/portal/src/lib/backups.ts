// Verwaltung → Sicherung (ADR 0019): the rows the API returns and how they are labelled.

export type BackupState = 'running' | 'ready' | 'failed' | 'cancelled' | 'expired';

export interface BackupRow {
  runId: number;
  startedAt: string;
  state: BackupState;
  runUrl: string;
  withFiles: boolean | null;
  artifact: { id: number; name: string; sizeBytes: number; expiresAt: string | null } | null;
}

export interface BackupList {
  configured: boolean;
  runs: BackupRow[];
}

export const STATE_LABEL: Record<BackupState, string> = {
  running: 'Läuft',
  ready: 'Fertig',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
  expired: 'Abgelaufen',
};

export const STATE_TONE: Record<BackupState, string> = {
  running: 'accent',
  ready: 'ok',
  failed: 'bad',
  cancelled: '',
  expired: '',
};

/** True while a backup is being made (the list is refreshed faster then). */
export function isRunning(rows: BackupRow[]): boolean {
  return rows.some((row) => row.state === 'running');
}

/** What a failed run most likely needs, from the owner's side. */
export const FAILED_HINT =
  'Im Protokoll steht der Grund. Häufig fehlt das Geheimnis BACKUP_PASSPHRASE (mindestens 16 Zeichen) in der GitHub-Umgebung „production“ oder SUPABASE_DB_URL ist nicht gesetzt (Runbook backups.md).';
