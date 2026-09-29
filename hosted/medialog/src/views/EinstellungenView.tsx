import type React from 'react';
import { useState } from 'react';
import { Overlay } from '../components/Overlay';
import { showToast } from '../components/Toast';
import type { AppSettings } from '../services/settings';
import type { Person } from '../services/sharing';
import type { MediaItem, MediaKind, MediaList, MediaStatus, MiniNodeUser } from '../types';

interface EinstellungenViewProps {
  items: MediaItem[];
  lists: MediaList[];
  currentUser: MiniNodeUser;
  people: Person[];
  accountUrl: string;
  settings: AppSettings;
  onChangeSettings: (changes: Partial<AppSettings>) => Promise<void>;
  onImportItems: (newItems: MediaItem[]) => Promise<void>;
  onImportFullBackup: (data: { items: MediaItem[]; lists: MediaList[] }) => Promise<number>;
}

export const EinstellungenView: React.FC<EinstellungenViewProps> = ({
  items,
  lists,
  currentUser,
  people,
  accountUrl,
  settings,
  onChangeSettings,
  onImportItems,
  onImportFullBackup,
}) => {
  // Theme state
  const [currentTheme, setCurrentTheme] = useState<'system' | 'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as any) || 'system';
  });

  const currentAccent = settings.accent;

  // CSV Import State
  const [_csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRawLines, setCsvRawLines] = useState<string[][]>([]);
  const [csvDelimiter, setCsvDelimiter] = useState<string>(';');
  const [showCsvMappingModal, setShowCsvMappingModal] = useState(false);
  const [columnMapping, setColumnMapping] = useState<{
    title: number;
    creator: number;
    year: number;
    kind: number;
    status: number;
    rating: number;
    notes: number;
  }>({
    title: 0,
    creator: 1,
    year: 2,
    kind: 3,
    status: 4,
    rating: 5,
    notes: 6,
  });

  // Set Theme
  const handleSetTheme = (theme: 'system' | 'light' | 'dark') => {
    setCurrentTheme(theme);
    // The App Kit remembers the choice for all MiniNode apps on this device.
    const kit = (window as { mnui?: { theme?: { set(t: string): void } } }).mnui;
    if (kit?.theme) kit.theme.set(theme);
    else if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    showToast(
      `Design auf ${theme === 'dark' ? 'Dunkel' : theme === 'light' ? 'Hell' : 'System'} gesetzt`,
    );
  };

  // Set Accent
  const handleSetAccent = (accent: string) => {
    void onChangeSettings({ accent }).then(
      () => showToast('Akzentfarbe gespeichert'),
      () => showToast('Akzentfarbe konnte nicht gespeichert werden'),
    );
  };

  // Export JSON Backup
  const handleExportJsonBackup = () => {
    const backupData = {
      app: 'medialog',
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
      lists,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medialog-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON-Sicherung heruntergeladen');
  };

  // Import JSON Backup
  const handleImportJsonBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = JSON.parse(reader.result as string);
        if (!raw || !Array.isArray(raw.items)) {
          alert('Ungültige Sicherungsdatei: Das Format entspricht nicht Medialog.');
          return;
        }

        // Validate the core fields and keep everything else the export wrote (volumes,
        // episodes, history, ...). Entries without an id get a fresh one.
        const obj = (v: unknown): v is Record<string, unknown> =>
          typeof v === 'object' && v !== null && !Array.isArray(v);
        const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
        const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
        const KINDS = ['book', 'audiobook', 'film', 'series', 'game', 'collection'];
        const STATUSES = ['active', 'wishlist', 'done', 'dropped'];
        const LIST_KINDS = ['watchlist', 'readinglist', 'custom', 'shopping', 'checklist'];
        const now = new Date().toISOString();

        const sanitizedItems: MediaItem[] = raw.items
          .filter(obj)
          .map((it: Record<string, unknown>) => {
            const { sharedWith: _to, sharedWithNames: _names, ...rest } = it;
            const rating = num(it.rating);
            return {
              ...(rest as unknown as MediaItem),
              id: str(it.id, 200) || crypto.randomUUID(),
              title: str(it.title, 200) || 'Ohne Titel',
              creator: str(it.creator, 200),
              year: num(it.year),
              kind: (KINDS.includes(String(it.kind)) ? it.kind : 'book') as MediaItem['kind'],
              genres: Array.isArray(it.genres) ? it.genres.map(String) : [],
              tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
              status: (STATUSES.includes(String(it.status))
                ? it.status
                : 'active') as MediaItem['status'],
              rating: rating ? Math.max(1, Math.min(10, rating)) : undefined,
              ownerId: currentUser.id,
              by: currentUser.name,
              updatedAt: str(it.updatedAt, 40) || now,
            };
          });

        const sanitizedLists: MediaList[] = (Array.isArray(raw.lists) ? raw.lists : [])
          .filter(obj)
          .map((l: Record<string, unknown>) => {
            const { sharedWith: _to, sharedWithNames: _names, ...rest } = l;
            return {
              ...(rest as unknown as MediaList),
              id: str(l.id, 200) || crypto.randomUUID(),
              title: str(l.title, 200) || 'Liste',
              kind: (LIST_KINDS.includes(String(l.kind)) ? l.kind : 'custom') as MediaList['kind'],
              itemIds: Array.isArray(l.itemIds) ? l.itemIds.map(String) : [],
              customItems: Array.isArray(l.customItems) ? l.customItems : [],
              ownerId: currentUser.id,
              by: currentUser.name,
              updatedAt: str(l.updatedAt, 40) || now,
            };
          });

        const skipped = await onImportFullBackup({ items: sanitizedItems, lists: sanitizedLists });
        showToast(
          `${sanitizedItems.length} Einträge und ${sanitizedLists.length} Listen gelesen` +
            (skipped ? `, ${skipped} hier neuere behalten` : ''),
        );
      } catch (_err) {
        alert('Fehler beim Lesen der JSON-Datei.');
      }
    };
    reader.readAsText(file);
  };

  // Export CSV
  const handleExportCsv = () => {
    // German CSV with ; and UTF-8 BOM
    const bom = '\uFEFF';
    const headers = [
      'Titel',
      'Urheber',
      'Jahr',
      'Typ',
      'Status',
      'Bewertung',
      'Notizen',
      'Aktualisiert',
    ];
    const rows = items.map((it) => [
      `"${(it.title || '').replace(/"/g, '""')}"`,
      `"${(it.creator || '').replace(/"/g, '""')}"`,
      it.year || '',
      it.kind,
      it.status,
      it.rating || '',
      `"${(it.notes || '').replace(/"/g, '""')}"`,
      it.updatedAt || '',
    ]);

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medialog-sammlung-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV-Export heruntergeladen');
  };

  // Read CSV for column mapping
  const handleCsvFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      // Auto-detect delimiter ; or ,
      const firstLine = text.split(/\r?\n/)[0] || '';
      const delimiter = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';
      setCsvDelimiter(delimiter);

      // Parse lines (first 10)
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((line) => {
          // simple split with quote awareness
          const parts: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              inQuotes = !inQuotes;
            } else if (ch === delimiter && !inQuotes) {
              parts.push(current.trim());
              current = '';
            } else {
              current += ch;
            }
          }
          parts.push(current.trim());
          return parts;
        });

      setCsvRawLines(lines);
      setShowCsvMappingModal(true);
    };
    reader.readAsText(file, 'utf-8');
  };

  // Execute CSV Import with user-chosen mapping
  const handleConfirmCsvImport = async () => {
    if (!csvRawLines || csvRawLines.length < 2) return;

    // Read all rows starting from row 1 (row 0 assumed header)
    const newItems: MediaItem[] = [];
    const now = new Date().toISOString();

    for (let i = 1; i < csvRawLines.length; i++) {
      const row = csvRawLines[i];
      const rawTitle = row[columnMapping.title] || '';
      if (!rawTitle.trim()) continue;

      const rawCreator = row[columnMapping.creator] || 'Unbekannt';
      const rawYear = parseInt(row[columnMapping.year] || '', 10) || undefined;
      const rawKind = (row[columnMapping.kind] || 'book').toLowerCase();
      const rawStatus = (row[columnMapping.status] || 'active').toLowerCase();
      const rawRating = parseInt(row[columnMapping.rating] || '', 10) || undefined;
      const rawNotes = row[columnMapping.notes] || undefined;

      let inferredSubtype: any;
      let finalKind: MediaKind = 'book';

      if (
        ['manga', 'manhwa', 'manhua', 'comic', 'novel', 'roman', 'light novel'].includes(rawKind)
      ) {
        finalKind = 'book';
        if (rawKind === 'manga') inferredSubtype = 'Manga';
        else if (rawKind === 'manhwa') inferredSubtype = 'Manhwa';
        else if (rawKind === 'manhua') inferredSubtype = 'Manhua';
        else if (rawKind === 'comic') inferredSubtype = 'Comic';
        else if (rawKind === 'light novel') inferredSubtype = 'Light Novel';
        else inferredSubtype = 'Roman';
      } else if (['film', 'series', 'game', 'collection'].includes(rawKind)) {
        finalKind = rawKind as MediaKind;
      }

      const status: MediaStatus = ['active', 'wishlist', 'done', 'dropped'].includes(rawStatus)
        ? (rawStatus as MediaStatus)
        : 'active';

      newItems.push({
        id: `csv_${Date.now()}_${i}`,
        title: rawTitle.replace(/^"|"$/g, '').trim(),
        creator: rawCreator.replace(/^"|"$/g, '').trim(),
        year: rawYear,
        kind: finalKind,
        bookSubtype: inferredSubtype,
        genres: [],
        tags: ['CSV-Import'],
        status,
        rating: rawRating && rawRating >= 1 && rawRating <= 10 ? rawRating : undefined,
        notes: rawNotes ? rawNotes.replace(/^"|"$/g, '').trim() : undefined,
        ownerId: currentUser.id,
        by: currentUser.name,
        updatedAt: now,
      });
    }

    if (newItems.length > 0) {
      await onImportItems(newItems);
      showToast(`${newItems.length} Einträge aus CSV importiert`);
    } else {
      showToast('Keine Einträge zum Importieren gefunden');
    }
    setShowCsvMappingModal(false);
  };

  return (
    <div className="grid gap-6">
      {/* Card 1: Konto und Suche */}
      <div className="mn-card">
        <h3 className="text-base font-bold mb-1">Konto</h3>
        <div className="flex items-center gap-3 p-3 bg-[var(--mn-surface-2)] rounded-xl mb-4">
          <span
            className="w-10 h-10 rounded-full bg-[var(--mn-accent)] text-[var(--mn-accent-ink)] font-bold flex items-center justify-center"
            aria-hidden="true"
          >
            {currentUser.avatarInitials}
          </span>
          <div className="flex-1 min-w-0">
            <span className="block font-bold text-sm text-[var(--mn-ink)]">{currentUser.name}</span>
            <span className="block text-xs text-[var(--mn-muted)]">{currentUser.email}</span>
          </div>
          <a className="mn-btn text-xs" href={accountUrl}>
            Konto verwalten
          </a>
        </div>
        <p className="text-xs text-[var(--mn-muted)]">
          {people.length === 0
            ? 'Außer dir nutzt noch niemand Medialog.'
            : `Teilen kannst du mit: ${people.map((p) => p.name).join(', ')}.`}
        </p>
      </div>

      <div className="mn-card">
        <h3 className="text-base font-bold mb-1">Online-Suche</h3>
        <label className="flex items-center justify-between gap-3 py-2">
          <span>
            <span className="block font-semibold text-sm">Deutsche Titel bevorzugen</span>
            <span className="block text-xs text-[var(--mn-muted)]">
              Sucht zusätzlich nach deutschen Ausgaben und zeigt den deutschen Titel, wenn es einen
              gibt.
            </span>
          </span>
          <input
            type="checkbox"
            className="w-6 h-6"
            checked={settings.preferGermanTitles}
            onChange={(e) =>
              void onChangeSettings({ preferGermanTitles: e.target.checked }).then(
                () =>
                  showToast(
                    e.target.checked ? 'Deutsche Titel bevorzugt' : 'Originaltitel bevorzugt',
                  ),
                () => showToast('Einstellung konnte nicht gespeichert werden'),
              )
            }
          />
        </label>
      </div>

      {/* Card 2: Datensicherung & Export/Import */}
      <div className="mn-card">
        <h3 className="text-base font-bold mb-1">Import & Export</h3>
        <p className="text-xs text-[var(--mn-muted)] mb-4">
          Sichere deine Mediensammlung oder importiere bestehende Daten aus CSV (Goodreads,
          Letterboxd) oder JSON.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* JSON Backup */}
          <div className="p-4 bg-[var(--mn-surface-2)] rounded-xl grid gap-3">
            <div>
              <b className="block text-sm">JSON-Vollsicherung</b>
              <span className="block text-xs text-[var(--mn-muted)]">
                Beinhaltet alle Medien, Bewertungen, Einzelfolgen und Listen.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="mn-btn mn-btn--primary text-xs flex-1"
                onClick={handleExportJsonBackup}
              >
                Sicherung herunterladen
              </button>
              <label className="mn-btn mn-btn--ghost text-xs cursor-pointer flex-1 text-center">
                <span>Wiederherstellen</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportJsonBackup}
                />
              </label>
            </div>
          </div>

          {/* CSV Export & Import */}
          <div className="p-4 bg-[var(--mn-surface-2)] rounded-xl grid gap-3">
            <div>
              <b className="block text-sm">CSV-Datenaustausch</b>
              <span className="block text-xs text-[var(--mn-muted)]">
                Tabelle mit Semikolon-Trennung und Spaltenzuordnung beim Import.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="mn-btn mn-btn--primary text-xs flex-1"
                onClick={handleExportCsv}
              >
                CSV Exportieren
              </button>
              <label className="mn-btn mn-btn--ghost text-xs cursor-pointer flex-1 text-center">
                <span>CSV Importieren</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleCsvFileSelected}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Design & Erscheinungsbild */}
      <div className="mn-card">
        <h3 className="text-base font-bold mb-1">Erscheinungsbild & Theme</h3>
        <p className="text-xs text-[var(--mn-muted)] mb-4">
          Wähle dein bevorzugtes Farbschema und die Akzentfarbe.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Light/Dark/System Toggle */}
          <div>
            <span className="block text-xs font-semibold text-[var(--mn-muted)] mb-2">
              Farbschema
            </span>
            <fieldset className="mn-seg" aria-label="Theme wählen">
              <button
                type="button"
                aria-pressed={currentTheme === 'system'}
                onClick={() => handleSetTheme('system')}
              >
                System
              </button>
              <button
                type="button"
                aria-pressed={currentTheme === 'light'}
                onClick={() => handleSetTheme('light')}
              >
                Hell
              </button>
              <button
                type="button"
                aria-pressed={currentTheme === 'dark'}
                onClick={() => handleSetTheme('dark')}
              >
                Dunkel
              </button>
            </fieldset>
          </div>

          {/* Accent Color */}
          <div>
            <span className="block text-xs font-semibold text-[var(--mn-muted)] mb-2">
              Akzentfarbe
            </span>
            <fieldset className="mn-chips" aria-label="Akzentfarbe wählen">
              {['blue', 'green', 'violet', 'amber', 'rose', 'teal'].map((acc) => (
                <button
                  key={acc}
                  type="button"
                  className="mn-filter text-xs"
                  aria-pressed={currentAccent === acc}
                  onClick={() => handleSetAccent(acc)}
                >
                  {acc.charAt(0).toUpperCase() + acc.slice(1)}
                </button>
              ))}
            </fieldset>
          </div>
        </div>
      </div>

      {/* CSV Mapping Modal */}
      {showCsvMappingModal && csvRawLines.length > 0 && (
        <Overlay onClose={() => setShowCsvMappingModal(false)} labelledBy="csv-title">
          <div className="mn-sheet-bar">
            <button
              type="button"
              className="mn-btn mn-btn--ghost"
              onClick={() => setShowCsvMappingModal(false)}
            >
              Abbrechen
            </button>
            <h2 id="csv-title">CSV-Spaltenzuordnung</h2>
            <span />
          </div>

          <div className="mn-sheet-body grid gap-4">
            <p className="text-xs text-[var(--mn-muted)]">
              Erkannter Trenner:{' '}
              <b className="mn-num">{csvDelimiter === ';' ? 'Semikolon (;)' : 'Komma (,)'}</b>.
              Ordne die Spalten deiner CSV-Datei den Feldern von Medialog zu:
            </p>

            {/* Column Mapping Selects */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="mn-field">
                Titel *
                <select
                  value={columnMapping.title}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, title: Number(e.target.value) })
                  }
                >
                  {csvRawLines[0]?.map((col, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: CSV columns are identified by their position
                    <option key={idx} value={idx}>
                      Spalte {idx + 1}: {col || '(leer)'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mn-field">
                Urheber / Autor
                <select
                  value={columnMapping.creator}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, creator: Number(e.target.value) })
                  }
                >
                  {csvRawLines[0]?.map((col, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: CSV columns are identified by their position
                    <option key={idx} value={idx}>
                      Spalte {idx + 1}: {col || '(leer)'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mn-field">
                Erscheinungsjahr
                <select
                  value={columnMapping.year}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, year: Number(e.target.value) })
                  }
                >
                  {csvRawLines[0]?.map((col, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: CSV columns are identified by their position
                    <option key={idx} value={idx}>
                      Spalte {idx + 1}: {col || '(leer)'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mn-field">
                Bewertung (1–10)
                <select
                  value={columnMapping.rating}
                  onChange={(e) =>
                    setColumnMapping({ ...columnMapping, rating: Number(e.target.value) })
                  }
                >
                  {csvRawLines[0]?.map((col, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: CSV columns are identified by their position
                    <option key={idx} value={idx}>
                      Spalte {idx + 1}: {col || '(leer)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Preview table of first 5 rows */}
            <div>
              <span className="block font-semibold text-xs mb-2">
                Vorschau der ersten 5 Zeilen:
              </span>
              <div className="overflow-x-auto border border-[var(--mn-line)] rounded-lg">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-[var(--mn-surface-2)]">
                    <tr>
                      {csvRawLines[0]?.map((col, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: CSV rows and cells are identified by their position
                        <th key={i} className="p-2 border-b border-[var(--mn-line)]">
                          {col || `Spalte ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRawLines.slice(1, 6).map((row, rIdx) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: CSV rows and cells are identified by their position
                      <tr key={rIdx} className="border-b border-[var(--mn-line)]">
                        {row.map((cell, cIdx) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: CSV rows and cells are identified by their position
                          <td key={cIdx} className="p-2 max-w-[140px] truncate">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              type="button"
              className="mn-btn mn-btn--primary w-full mt-2"
              onClick={handleConfirmCsvImport}
            >
              CSV jetzt importieren
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
};
