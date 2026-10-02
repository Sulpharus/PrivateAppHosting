import type React from 'react';
import { useState } from 'react';
import { Overlay } from '../components/Overlay';
import { showToast } from '../components/Toast';
import { locale, t } from '../i18n';
import type { ConsumptionLogEntry, MediaItem } from '../types';
import { formatDate, formatMinutes, getKindLabel, getSubtypeLabel } from '../utils/text';

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
        ).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : '-';

  // Aggregate all consumption logs across all media items
  const allLogs: ConsumptionLogEntry[] = [];
  items.forEach((item) => {
    if (item.consumptionLogs) {
      allLogs.push(...item.consumptionLogs);
    }
  });

  // Calculate day-by-day activity for the past 70 days (10 full weeks ending on a Sunday)
  const today = new Date();
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

    const dayName = d.toLocaleDateString(locale(), { weekday: 'long' });
    const formattedDate = d.toLocaleDateString(locale(), {
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
      title: `${dayName}, ${formattedDate}`,
      label: t('stats.dayLabel', { day: dayName, date: formattedDate, n: count }),
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
    showToast(t('stats.logSaved', { date: formatDate(logDate) }));
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
          <span>{t('stats.kpiTotal')}</span>
        </div>
        <div className="mn-kpi">
          <b>{doneItems.length}</b>
          <span>{t('stats.kpiDone')}</span>
        </div>
        <div className="mn-kpi">
          <b>★ {avgRating}</b>
          <span>{t('stats.kpiAvg')}</span>
        </div>
        <div className="mn-kpi">
          <b>{totalPages}</b>
          <span>{t('stats.kpiPages')}</span>
        </div>
        <div className="mn-kpi">
          <b>{formatMinutes(totalAudioMinutes)}</b>
          <span>{t('stats.kpiAudio')}</span>
        </div>
        <div className="mn-kpi">
          <b>{t('stats.hoursValue', { n: totalHours })}</b>
          <span>{t('stats.kpiHours')}</span>
        </div>
      </div>

      {/* Konsum-Aktivität (Heat Grid with Gold Bordered Sundays and Hover / Click Interaction) */}
      <div className="mn-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h3 className="text-base font-bold">{t('stats.activityTitle')}</h3>
            <p className="text-xs text-[var(--mn-muted)]">
              {t('stats.activityHint')}{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {t('stats.sundayHint')}
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
            {t('stats.logByDate')}
          </button>
        </div>

        {/* Live Hover Info Display */}
        <div className="h-6 text-xs font-semibold text-[var(--mn-accent-text)] mb-2">
          {hoveredDayInfo ? `ℹ️ ${hoveredDayInfo}` : t('stats.hoverHint')}
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
            <span>{t('stats.legendSunday')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>{t('stats.legendNone')}</span>
            <span className="w-3 h-3 rounded bg-[var(--mn-surface)] border border-[var(--mn-line)]" />
            <span className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/40" />
            <span className="w-3 h-3 rounded bg-[var(--mn-accent-soft)]" />
            <span className="w-3 h-3 rounded bg-[var(--mn-accent)]" />
            <span>{t('stats.legendMany')}</span>
          </div>
        </div>
      </div>

      {/* Two columns: Book Formats and Top Genres */}
      <div className="mn-cols">
        {/* Book Subtypes Breakdown */}
        <div className="mn-card">
          <h3 className="text-base font-bold mb-1">
            {t('stats.formatsTitle', { n: bookItems.length })}
          </h3>
          <p className="text-xs text-[var(--mn-muted)] mb-4">{t('stats.formatsHint')}</p>
          {subtypesList.length > 0 ? (
            subtypesList.map(([sub, count]) => {
              const pct = Math.round((count / bookItems.length) * 100);
              return (
                <div key={sub} className="mn-bar">
                  <div className="mn-bar-top">
                    <b>{getSubtypeLabel(sub)}</b>
                    <span>{t('stats.titles', { n: count, pct })}</span>
                  </div>
                  <div className="mn-meter">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-[var(--mn-muted)]">{t('stats.noBooks')}</p>
          )}
        </div>

        {/* Top Genres */}
        <div className="mn-card">
          <h3 className="text-base font-bold mb-4">{t('stats.topGenres')}</h3>
          {topGenres.length > 0 ? (
            topGenres.map(([genre, count]) => {
              const pct = Math.round((count / items.length) * 100);
              return (
                <div key={genre} className="mn-bar">
                  <div className="mn-bar-top">
                    <b>{genre}</b>
                    <span>{t('stats.works', { n: count, pct })}</span>
                  </div>
                  <div className="mn-meter">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-[var(--mn-muted)]">{t('stats.noGenres')}</p>
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
              {t('common.close')}
            </button>
            <h2 id="day-title">{formatDate(selectedDay)}</h2>
            <span />
          </div>

          <div className="mn-sheet-body grid gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--mn-line)]">
              <div>
                <b className="text-base block">{selectedDayInfo.title}</b>
                {selectedDayInfo.isSunday && (
                  <span className="inline-block text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full mt-1">
                    {t('stats.sunday')}
                  </span>
                )}
              </div>
              <span className="mn-chip mn-chip--plain font-bold">
                {t('stats.entries', { n: selectedDayInfo.count })}
              </span>
            </div>

            {selectedDayInfo.matchingLogs.length > 0 ? (
              <div className="grid gap-2.5">
                <h4 className="text-xs font-bold text-[var(--mn-muted)]">
                  {t('stats.loggedThatDay')}
                </h4>
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
                        {t('stats.noteQuote', { text: log.progressNote })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-[var(--mn-muted)] bg-[var(--mn-surface-2)] rounded-xl">
                {t('stats.noneThatDay')}
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
                {t('stats.addForDay', { date: formatDate(selectedDay) })}
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
              {t('common.cancel')}
            </button>
            <h2 id="add-log-title">{t('stats.addLogTitle')}</h2>
            <span />
          </div>

          <form onSubmit={handleSaveManualLog} className="mn-sheet-body mn-form">
            <fieldset>
              <label className="mn-field">
                {t('stats.logDate')}
                <input
                  type="date"
                  required
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                />
              </label>

              <label className="mn-field">
                {t('stats.logWork')}
                <select value={logWorkId} onChange={(e) => setLogWorkId(e.target.value)} required>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.title} ({getKindLabel(it.kind)})
                    </option>
                  ))}
                </select>
              </label>

              <label className="mn-field">
                {t('stats.logWhat')}
                <input
                  type="text"
                  required
                  placeholder={t('stats.logWhatPh')}
                  value={logAction}
                  onChange={(e) => setLogAction(e.target.value)}
                />
              </label>

              <label className="mn-field">
                {t('stats.logNote')}
                <textarea
                  rows={3}
                  placeholder={t('stats.logNotePh')}
                  value={logNote}
                  onChange={(e) => setLogNote(e.target.value)}
                />
              </label>
            </fieldset>

            <button type="submit" className="mn-btn mn-btn--primary w-full mt-4">
              {t('stats.logSave')}
            </button>
          </form>
        </Overlay>
      )}
    </div>
  );
};
