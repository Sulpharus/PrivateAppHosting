import type React from 'react';
import { useState } from 'react';
import { Overlay } from '../components/Overlay';
import { showToast } from '../components/Toast';
import type { ConsumptionLogEntry, MediaItem } from '../types';
import { formatDateDe, formatMinutes, getKindLabel } from '../utils/text';

interface StatistikViewProps {
  items: MediaItem[];
  onSaveItem?: (item: MediaItem) => Promise<void>;
}

export const StatistikView: React.FC<StatistikViewProps> = ({ items, onSaveItem }) => {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hoveredDayInfo, setHoveredDayInfo] = useState<string | null>(null);

  // Manual log modal
  const [showAddLogModal, setShowAddLogModal] = useState(false);
  const [logWorkId, setLogWorkId] = useState(items[0]?.id || '');
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logAction, setLogAction] = useState('');
  const [logNote, setLogNote] = useState('');

  const doneItems = items.filter((i) => i.status === 'done');

  // Total pages read
  const totalPages = items.reduce((sum, item) => sum + (item.currentPage || 0), 0);

  // Total hours played
  const totalHours = items.reduce((sum, item) => sum + (item.hoursPlayed || 0), 0);

  // Total audiobook minutes
  const totalAudioMinutes = items.reduce((sum, item) => sum + (item.audioCurrentMinutes || 0), 0);

  // Average rating
  const ratedItems = items.filter((i) => i.rating && i.rating > 0);
  const avgRating =
    ratedItems.length > 0
      ? (
          ratedItems.reduce((acc, it) => acc + (it.rating || 0), 0) / ratedItems.length
        ).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '-';

  // Aggregate all consumption logs across all media items
  const allLogs: ConsumptionLogEntry[] = [];
  items.forEach((item) => {
    if (item.consumptionLogs) {
      allLogs.push(...item.consumptionLogs);
    }
  });

  // Calculate day-by-day activity for the past 70 days (10 full weeks ending on a Sunday)
  const today = new Date('2026-09-29T12:00:00Z');
  const pastDays = Array.from({ length: 70 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (69 - i));
    const isoDate = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday ... 6 = Saturday
    const isSunday = dayOfWeek === 0;

    const matchingLogs = allLogs.filter((log) => log.date === isoDate);
    const count = matchingLogs.length;

    let intensityClass = '';
    if (count >= 3) intensityClass = 'l3';
    else if (count === 2) intensityClass = 'l2';
    else if (count === 1) intensityClass = 'l1';

    const dayName = d.toLocaleDateString('de-DE', { weekday: 'long' });
    const formattedDate = d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    return {
      date: isoDate,
      dayOfWeek,
      isSunday,
      count,
      intensityClass,
      label: `${dayName}, ${formattedDate} (${count} ${count === 1 ? 'Aktivität' : 'Aktivitäten'})`,
      matchingLogs,
    };
  });

  // Handle adding log entry
  const handleSaveManualLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logWorkId || !logAction.trim() || !onSaveItem) return;

    const targetItem = items.find((it) => it.id === logWorkId);
    if (!targetItem) return;

    const newEntry: ConsumptionLogEntry = {
      id: `log_${Date.now()}`,
      workId: targetItem.id,
      workTitle: targetItem.title,
      kind: targetItem.kind,
      date: logDate,
      action: logAction.trim(),
      progressNote: logNote.trim() || undefined,
    };

    const updated: MediaItem = {
      ...targetItem,
      consumptionLogs: [newEntry, ...(targetItem.consumptionLogs || [])],
      updatedAt: new Date().toISOString(),
    };

    await onSaveItem(updated);
    setShowAddLogModal(false);
    setLogAction('');
    setLogNote('');
    showToast(`Aktivität für den ${formatDateDe(logDate)} gespeichert`);
  };

  // Details for selected day
  const selectedDayInfo = pastDays.find((d) => d.date === selectedDay);

  // Genre counts
  const genreCounts = new Map<string, number>();
  items.forEach((item) => {
    item.genres.forEach((g) => {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    });
  });
  const topGenres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Book Subtypes (Roman, Manga, Manhwa, Manhua)
  const bookItems = items.filter((i) => i.kind === 'book');
  const subtypeCounts = new Map<string, number>();
  bookItems.forEach((b) => {
    const sub = b.bookSubtype || 'Roman';
    subtypeCounts.set(sub, (subtypeCounts.get(sub) || 0) + 1);
  });
  const subtypesList = Array.from(subtypeCounts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-8">
      {/* Top KPIs */}
      <div className="mn-kpis">
        <div className="mn-kpi">
          <b>{items.length}</b>
          <span>Gesamte Werke</span>
        </div>
        <div className="mn-kpi">
          <b>{doneItems.length}</b>
          <span>Beendete Werke</span>
        </div>
        <div className="mn-kpi">
          <b>★ {avgRating}</b>
          <span>Durchschnitt (1–10)</span>
        </div>
        <div className="mn-kpi">
          <b>{totalPages}</b>
          <span>Gelesene Seiten</span>
        </div>
        <div className="mn-kpi">
          <b>{formatMinutes(totalAudioMinutes)}</b>
          <span>Gehörte Hörbücher</span>
        </div>
        <div className="mn-kpi">
          <b>{totalHours} h</b>
          <span>Gespielte Stunden</span>
        </div>
      </div>

      {/* Konsum-Aktivität (Heat Grid with Gold Bordered Sundays and Hover / Click Interaction) */}
      <div className="mn-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h3 className="text-base font-bold">Konsum-Aktivität der letzten 10 Wochen</h3>
            <p className="text-xs text-[var(--mn-muted)]">
              Klicke auf einen Tag, um alle Aktivitäten einzusehen.{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                Sonntage sind mit goldener Umrandung hervorgehoben.
              </span>
            </p>
          </div>
          <button
            type="button"
            className="mn-btn mn-btn--primary text-xs"
            onClick={() => {
              setLogDate(new Date().toISOString().slice(0, 10));
              setShowAddLogModal(true);
            }}
          >
            📅 Aktivität nach Datum loggen
          </button>
        </div>

        {/* Live Hover Info Display */}
        <div className="h-6 text-xs font-semibold text-[var(--mn-accent-text)] mb-2">
          {hoveredDayInfo ? `ℹ️ ${hoveredDayInfo}` : 'Bewege die Maus über einen Tag für Details'}
        </div>

        {/* 70 Days Grid (10 columns x 7 days) */}
        <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 p-2 bg-[var(--mn-surface-2)] rounded-xl">
          {pastDays.map((day) => (
            <button
              key={day.date}
              type="button"
              className={`aspect-square rounded flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-110 cursor-pointer ${
                day.count > 0
                  ? day.count >= 3
                    ? 'bg-[var(--mn-accent)] text-[var(--mn-accent-ink)]'
                    : day.count === 2
                      ? 'bg-[var(--mn-accent-soft)] text-[var(--mn-accent-text)]'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100'
                  : 'bg-[var(--mn-surface)] text-[var(--mn-muted)]'
              }`}
              style={{
                // Sonntag goldene Border
                border: day.isSunday ? '2.5px solid #d4af37' : '1px solid var(--mn-line)',
                boxShadow: day.isSunday ? '0 0 6px rgba(212, 175, 55, 0.5)' : undefined,
              }}
              title={day.label}
              onMouseEnter={() => setHoveredDayInfo(day.label)}
              onMouseLeave={() => setHoveredDayInfo(null)}
              onClick={() => setSelectedDay(day.date)}
            >
              <span>{day.date.slice(8, 10)}</span>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-xs text-[var(--mn-muted)] mt-3 pt-2 border-t border-[var(--mn-line)]">
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded border-[2.5px] border-[#d4af37] bg-[var(--mn-surface)]" />
            <span>Sonntag (Gold)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Keine Aktivität</span>
            <span className="w-3 h-3 rounded bg-[var(--mn-surface)] border border-[var(--mn-line)]" />
            <span className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/40" />
            <span className="w-3 h-3 rounded bg-[var(--mn-accent-soft)]" />
            <span className="w-3 h-3 rounded bg-[var(--mn-accent)]" />
            <span>Sehr aktiv</span>
          </div>
        </div>
      </div>

      {/* Two columns: Book Formats and Top Genres */}
      <div className="mn-cols">
        {/* Book Subtypes Breakdown */}
        <div className="mn-card">
          <h3 className="text-base font-bold mb-1">Buch-Formate & Manga ({bookItems.length})</h3>
          <p className="text-xs text-[var(--mn-muted)] mb-4">
            Manga, Manhwa, Manhua, Romane und Comics im Archiv
          </p>
          {subtypesList.length > 0 ? (
            subtypesList.map(([sub, count]) => {
              const pct = Math.round((count / bookItems.length) * 100);
              return (
                <div key={sub} className="mn-bar">
                  <div className="mn-bar-top">
                    <b>{sub}</b>
                    <span>
                      {count} {count === 1 ? 'Titel' : 'Titel'}, {pct} %
                    </span>
                  </div>
                  <div className="mn-meter">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-[var(--mn-muted)]">
              Noch keine Bücher oder Manga verzeichnet.
            </p>
          )}
        </div>

        {/* Top Genres */}
        <div className="mn-card">
          <h3 className="text-base font-bold mb-4">Top Genres</h3>
          {topGenres.length > 0 ? (
            topGenres.map(([genre, count]) => {
              const pct = Math.round((count / items.length) * 100);
              return (
                <div key={genre} className="mn-bar">
                  <div className="mn-bar-top">
                    <b>{genre}</b>
                    <span>
                      {count} {count === 1 ? 'Werk' : 'Werke'}, {pct} %
                    </span>
                  </div>
                  <div className="mn-meter">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-[var(--mn-muted)]">Noch keine Genres erfasst.</p>
          )}
        </div>
      </div>

      {/* Modal: Activity for selected day */}
      {selectedDay && selectedDayInfo && (
        <Overlay onClose={() => setSelectedDay(null)} labelledBy="day-title">
          <div className="mn-sheet-bar">
            <button
              type="button"
              className="mn-btn mn-btn--ghost"
              onClick={() => setSelectedDay(null)}
            >
              Schließen
            </button>
            <h2 id="day-title">{formatDateDe(selectedDay)}</h2>
            <span />
          </div>

          <div className="mn-sheet-body grid gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--mn-line)]">
              <div>
                <b className="text-base block">{selectedDayInfo.label.split('(')[0]}</b>
                {selectedDayInfo.isSunday && (
                  <span className="inline-block text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full mt-1">
                    ✨ Sonntag
                  </span>
                )}
              </div>
              <span className="mn-chip mn-chip--plain font-bold">
                {selectedDayInfo.count} {selectedDayInfo.count === 1 ? 'Eintrag' : 'Einträge'}
              </span>
            </div>

            {selectedDayInfo.matchingLogs.length > 0 ? (
              <div className="grid gap-2.5">
                <h4 className="text-xs font-bold text-[var(--mn-muted)]">An diesem Tag geloggt:</h4>
                {selectedDayInfo.matchingLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-[var(--mn-surface-2)] rounded-lg text-sm border-l-4 border-[var(--mn-accent)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-base text-[var(--mn-ink)]">{log.workTitle}</b>
                      <span className="mn-chip mn-chip--plain text-xs">
                        {getKindLabel(log.kind)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-[var(--mn-accent-text)] mt-1">
                      {log.action}
                    </p>
                    {log.progressNote && (
                      <p className="text-xs text-[var(--mn-muted)] mt-1.5 italic">
                        „{log.progressNote}“
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-[var(--mn-muted)] bg-[var(--mn-surface-2)] rounded-xl">
                Für diesen Tag wurde noch keine Aktivität protokolliert.
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                className="mn-btn mn-btn--primary w-full"
                onClick={() => {
                  setLogDate(selectedDay);
                  setSelectedDay(null);
                  setShowAddLogModal(true);
                }}
              >
                + Aktivität für den {formatDateDe(selectedDay)} eintragen
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Modal: Add Manual Log with Date */}
      {showAddLogModal && (
        <Overlay onClose={() => setShowAddLogModal(false)} labelledBy="add-log-title">
          <div className="mn-sheet-bar">
            <button
              type="button"
              className="mn-btn mn-btn--ghost"
              onClick={() => setShowAddLogModal(false)}
            >
              Abbrechen
            </button>
            <h2 id="add-log-title">Konsum-Aktivität eintragen</h2>
            <span />
          </div>

          <form onSubmit={handleSaveManualLog} className="mn-sheet-body mn-form">
            <fieldset>
              <label className="mn-field">
                Datum der Aktivität *
                <input
                  type="date"
                  required
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                />
              </label>

              <label className="mn-field">
                Werk auswählen *
                <select value={logWorkId} onChange={(e) => setLogWorkId(e.target.value)} required>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.title} ({getKindLabel(it.kind)})
                    </option>
                  ))}
                </select>
              </label>

              <label className="mn-field">
                Was hast du gemacht? *
                <input
                  type="text"
                  required
                  placeholder="z. B. Kapitel 4 gelesen, Folge 2 geschaut, Band 14 beendet ..."
                  value={logAction}
                  onChange={(e) => setLogAction(e.target.value)}
                />
              </label>

              <label className="mn-field">
                Optionale Notiz / Eindrücke
                <textarea
                  rows={3}
                  placeholder="Gedanken, Zitate oder Rezension ..."
                  value={logNote}
                  onChange={(e) => setLogNote(e.target.value)}
                />
              </label>
            </fieldset>

            <button type="submit" className="mn-btn mn-btn--primary w-full mt-4">
              Aktivität speichern
            </button>
          </form>
        </Overlay>
      )}
    </div>
  );
};
