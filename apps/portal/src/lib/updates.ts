/** What GET /admin/updates answers (apps/api/src/routes/updates.ts). */
export interface UpdatesView {
  platform: {
    source: string | null;
    installed: string | null;
    latest: { tag: string; name: string | null; prerelease: boolean; url: string } | null;
    upToDate: boolean | null;
  };
  apps: {
    slug: string;
    name: string;
    repository: string;
    installedCommit: string | null;
    latestCommit: string | null;
    upToDate: boolean | null;
  }[];
}

/** The pill next to a version: true = current, false = update available, null = not known. */
export function updateLabel(upToDate: boolean | null): { text: string; tone: string } {
  if (upToDate === true) return { text: 'Aktuell', tone: 'ok' };
  if (upToDate === false) return { text: 'Update verfügbar', tone: 'accent' };
  return { text: 'Stand unbekannt', tone: '' };
}
