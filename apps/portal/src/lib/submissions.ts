// Uploads in Verwaltung → Hochladen (ADR 0013): row shape, labels and the hand-over text.

export type SubmissionStatus =
  | 'queued'
  | 'integrating'
  | 'installing'
  | 'integrated'
  | 'installed'
  | 'needs_review'
  | 'failed'
  | 'dismissed';

export interface Submission {
  id: string;
  kind: 'webapp' | 'program';
  filename: string;
  size_bytes: number;
  status: SubmissionStatus;
  slug: string | null;
  name: string | null;
  summary: {
    framework?: string;
    reasons?: { code: string; message: string; file?: string }[];
    warnings?: string[];
    actions?: string[];
    program?: string;
    runtime?: string;
  };
  log: string | null;
  run_url: string | null;
  pr_url: string | null;
  review_url: string | null;
  created_at: string;
}

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  queued: 'Wartet',
  integrating: 'Wird eingebaut',
  installing: 'Wird installiert',
  integrated: 'Eingebaut',
  installed: 'Installiert',
  needs_review: 'Braucht Prüfung',
  failed: 'Fehlgeschlagen',
  dismissed: 'Ausgeblendet',
};

/** States that change on their own: the page keeps polling while one exists. */
export function isRunning(status: SubmissionStatus): boolean {
  return status === 'queued' || status === 'integrating' || status === 'installing';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

/**
 * The hand-over for a Claude Code session: what was uploaded, why the script stopped and where
 * to find the file. The same facts the review issue carries, for uploads without one (programs).
 */
export function reviewPrompt(row: Submission): string {
  const reasons = (row.summary.reasons ?? []).map(
    (reason) => `- ${reason.code}${reason.file ? ` (${reason.file})` : ''}: ${reason.message}`,
  );
  const where =
    row.kind === 'webapp'
      ? row.review_url
        ? `Das ZIP und der Bericht liegen im Branch review/${row.id.slice(0, 8)} (Issue: ${row.review_url}).`
        : 'Das ZIP liegt im privaten Speicher; der Bericht steht unten.'
      : `Der Installer liegt in R2 unter installers/${row.slug ?? '<slug>'}/${row.filename}.`;
  return [
    row.kind === 'webapp'
      ? `Arbeite den Upload „${row.filename}“ ab, den das Einbau-Skript nicht fertig integrieren konnte (Skill integrate-app).`
      : `Das Programm „${row.filename}“ ließ sich nicht automatisch auf dem PC/Server installieren (Playbook native-installer.md).`,
    where,
    '',
    'Warum es hakt:',
    ...(reasons.length > 0 ? reasons : ['- (kein Grund gespeichert, siehe Protokoll)']),
    '',
    row.log ? `Protokoll:\n${row.log.slice(0, 3000)}` : '',
  ]
    .join('\n')
    .trim();
}
