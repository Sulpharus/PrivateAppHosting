/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { mininode } from '../mininode';
import type { Contact, KanbanTask, Meetup } from '../types';

interface KalenderViewProps {
  meetups: Meetup[];
  contacts: Contact[];
  tasks: KanbanTask[];
  onAddMeetup: (meetup: Omit<Meetup, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateMeetup: (meetup: Meetup) => Promise<void>;
  onDeleteMeetup: (id: string) => Promise<void>;
  newMeetupTrigger?: number;
}

export default function KalenderView({
  meetups,
  contacts,
  tasks,
  onAddMeetup,
  onUpdateMeetup,
  onDeleteMeetup,
  newMeetupTrigger,
}: KalenderViewProps) {
  // Current selected date (YYYY-MM-DD)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Month navigation state: base date for current month viewing
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => new Date());

  // Week navigation offset (number of weeks from today)
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Google Calendar integration status
  const [googleConnected, setGoogleConnected] = useState<boolean>(false);
  const [googleConnectUrl, setGoogleConnectUrl] = useState<string>('');

  // Meetup modal
  const [isMeetupModalOpen, setIsMeetupModalOpen] = useState(false);
  const [editingMeetup, setEditingMeetup] = useState<Meetup | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContactId, setFormContactId] = useState('');
  const [formDate, setFormDate] = useState(todayStr);
  const [formTime, setFormTime] = useState('14:00');
  const [formLocation, setFormLocation] = useState('');
  const [formPrepNotes, setFormPrepNotes] = useState('');

  // Check Google status
  useEffect(() => {
    async function checkGoogle() {
      try {
        const mn = await mininode();
        const connected = await mn.google.connected();
        setGoogleConnected(connected);
        setGoogleConnectUrl(mn.google.connectUrl());
      } catch (e) {}
    }
    checkGoogle();
  }, []);

  // Compute week days for the week strip
  const weekDays = useMemo(() => {
    const d = new Date();
    // Start of week: Monday
    const dayOfWeek = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dayOfWeek + weekOffset * 7);

    const days: {
      dateStr: string;
      dayNum: number;
      dayName: string;
      isToday: boolean;
      hasEntries: boolean;
    }[] = [];
    const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    for (let i = 0; i < 7; i++) {
      const cur = new Date(d);
      cur.setDate(d.getDate() + i);
      const str = cur.toISOString().slice(0, 10);
      const isToday = str === todayStr;

      const hasMeetup = meetups.some((m) => m.date === str);
      const hasFollowUp = contacts.some((c) => c.followUpDate === str);
      const hasTask = tasks.some((t) => t.dueDate === str);

      days.push({
        dateStr: str,
        dayNum: cur.getDate(),
        dayName: names[i],
        isToday,
        hasEntries: hasMeetup || hasFollowUp || hasTask,
      });
    }

    return days;
  }, [weekOffset, todayStr, meetups, contacts, tasks]);

  // Week label
  const weekLabel = useMemo(() => {
    if (weekDays.length === 0) return '';
    const first = new Date(weekDays[0].dateStr);
    const last = new Date(weekDays[6].dateStr);
    const fmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
    return `${fmt.format(first)} bis ${fmt.format(last)}`;
  }, [weekDays]);

  // Compute month cells
  const monthInfo = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: {
      dateStr: string;
      dayNum: number;
      isOut: boolean;
      isToday: boolean;
      hasEntries: boolean;
    }[] = [];

    // Preceding month days
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, prevMonthDays - i);
      const str = prevDate.toISOString().slice(0, 10);
      cells.push({
        dateStr: str,
        dayNum: prevDate.getDate(),
        isOut: true,
        isToday: str === todayStr,
        hasEntries:
          meetups.some((m) => m.date === str) ||
          contacts.some((c) => c.followUpDate === str) ||
          tasks.some((t) => t.dueDate === str),
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const cur = new Date(year, month, d);
      const str = cur.toISOString().slice(0, 10);
      cells.push({
        dateStr: str,
        dayNum: d,
        isOut: false,
        isToday: str === todayStr,
        hasEntries:
          meetups.some((m) => m.date === str) ||
          contacts.some((c) => c.followUpDate === str) ||
          tasks.some((t) => t.dueDate === str),
      });
    }

    // Trailing days to reach multiple of 7 (35 or 42)
    const totalNeeded = cells.length > 35 ? 42 : 35;
    let nextDay = 1;
    while (cells.length < totalNeeded) {
      const nextDate = new Date(year, month + 1, nextDay);
      const str = nextDate.toISOString().slice(0, 10);
      cells.push({
        dateStr: str,
        dayNum: nextDay,
        isOut: true,
        isToday: str === todayStr,
        hasEntries:
          meetups.some((m) => m.date === str) ||
          contacts.some((c) => c.followUpDate === str) ||
          tasks.some((t) => t.dueDate === str),
      });
      nextDay++;
    }

    const monthTitle = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(
      currentMonthDate,
    );
    return { monthTitle, cells };
  }, [currentMonthDate, todayStr, meetups, contacts, tasks]);

  // Selected Day Entries
  const selectedDayMeetups = useMemo(() => {
    return meetups.filter((m) => m.date === selectedDate);
  }, [meetups, selectedDate]);

  const selectedDayFollowUps = useMemo(() => {
    return contacts.filter((c) => c.followUpDate === selectedDate);
  }, [contacts, selectedDate]);

  const selectedDayTasks = useMemo(() => {
    return tasks.filter((t) => t.dueDate === selectedDate);
  }, [tasks, selectedDate]);

  const totalEntriesForSelected =
    selectedDayMeetups.length + selectedDayFollowUps.length + selectedDayTasks.length;

  const handleOpenAddMeetup = (date?: string) => {
    setEditingMeetup(null);
    setFormTitle('');
    setFormContactId(contacts[0]?.id || '');
    setFormDate(date || selectedDate);
    setFormTime('14:00');
    setFormLocation('');
    setFormPrepNotes('');
    setIsMeetupModalOpen(true);
  };

  useEffect(() => {
    if (newMeetupTrigger && newMeetupTrigger > 0) {
      handleOpenAddMeetup();
    }
  }, [newMeetupTrigger]);

  const handleSaveMeetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingMeetup) {
      await onUpdateMeetup({
        ...editingMeetup,
        title: formTitle.trim(),
        contactId: formContactId,
        date: formDate,
        time: formTime || undefined,
        location: formLocation.trim() || undefined,
        preparationNotes: formPrepNotes.trim() || undefined,
      });
      if (window.mnui?.toast) window.mnui.toast('Termin aktualisiert');
    } else {
      await onAddMeetup({
        title: formTitle.trim(),
        contactId: formContactId,
        date: formDate,
        time: formTime || undefined,
        location: formLocation.trim() || undefined,
        preparationNotes: formPrepNotes.trim() || undefined,
        completed: false,
      });
      if (window.mnui?.toast) window.mnui.toast('Termin geplant');
    }

    setIsMeetupModalOpen(false);
  };

  return (
    <div className="mn-kalender-view">
      {/* Top Week Strip */}
      <div style={{ marginBottom: 'var(--mn-s6)' }}>
        <div className="mn-week">
          <button
            className="mn-icon-btn"
            type="button"
            aria-label="Vorherige Woche"
            onClick={() => setWeekOffset((w) => w - 1)}
          >
            ‹
          </button>
          <span className="mn-week-label">{weekLabel}</span>
          <div className="mn-week-days">
            {weekDays.map((d) => (
              <button
                key={d.dateStr}
                className={`mn-day ${d.isToday ? 'today' : ''} ${d.hasEntries ? 'has' : ''}`}
                type="button"
                aria-pressed={selectedDate === d.dateStr}
                onClick={() => setSelectedDate(d.dateStr)}
              >
                <small>{d.dayName}</small>
                <b>{d.dayNum}</b>
                <i />
              </button>
            ))}
          </div>
          <button
            className="mn-icon-btn"
            type="button"
            aria-label="Nächste Woche"
            onClick={() => setWeekOffset((w) => w + 1)}
          >
            ›
          </button>
        </div>

        {/* Back to today link if navigated away */}
        {(weekOffset !== 0 || selectedDate !== todayStr) && (
          <div style={{ textAlign: 'center', marginTop: 'var(--mn-s2)' }}>
            <button
              className="mn-link"
              type="button"
              style={{ fontSize: 'var(--mn-fs-sm)' }}
              onClick={() => {
                setWeekOffset(0);
                setSelectedDate(todayStr);
                setCurrentMonthDate(new Date());
              }}
            >
              Zurück zu heute
            </button>
          </div>
        )}
      </div>

      {/* Main Desktop Split Layout: Month Grid + Day Schedule List */}
      <div className="mn-split mn-split--start">
        {/* Month Grid Card */}
        <div className="mn-card">
          <div className="mn-cal-head">
            <button
              className="mn-icon-btn"
              type="button"
              aria-label="Vorheriger Monat"
              onClick={() => {
                const prev = new Date(currentMonthDate);
                prev.setMonth(prev.getMonth() - 1);
                setCurrentMonthDate(prev);
              }}
            >
              ‹
            </button>
            <h2>{monthInfo.monthTitle}</h2>
            <button
              className="mn-icon-btn"
              type="button"
              aria-label="Nächster Monat"
              onClick={() => {
                const next = new Date(currentMonthDate);
                next.setMonth(next.getMonth() + 1);
                setCurrentMonthDate(next);
              }}
            >
              ›
            </button>
          </div>

          <div className="mn-cal" style={{ marginBottom: 4 }}>
            <span className="mn-dow">Mo</span>
            <span className="mn-dow">Di</span>
            <span className="mn-dow">Mi</span>
            <span className="mn-dow">Do</span>
            <span className="mn-dow">Fr</span>
            <span className="mn-dow">Sa</span>
            <span className="mn-dow">So</span>
          </div>

          <div className="mn-cal">
            {monthInfo.cells.map((c) => (
              <button
                key={c.dateStr}
                className={`mn-cell ${c.isOut ? 'out' : ''} ${c.isToday ? 'today' : ''}`}
                type="button"
                aria-pressed={selectedDate === c.dateStr}
                onClick={() => setSelectedDate(c.dateStr)}
              >
                <span>{c.dayNum}</span>
                <span className="mn-dots">{c.hasEntries && <i />}</span>
              </button>
            ))}
          </div>

          {/* Google Calendar status bar */}
          <div
            style={{
              marginTop: 'var(--mn-s5)',
              borderTop: '1px solid var(--mn-line)',
              paddingTop: 'var(--mn-s3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 'var(--mn-fs-xs)', color: 'var(--mn-muted)' }}>
              Google Kalender: {googleConnected ? 'Verbunden' : 'Nicht verbunden'}
            </span>
            {!googleConnected && (
              <a
                className="mn-link"
                href={googleConnectUrl || 'https://mininode.app/google/connect'}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 'var(--mn-fs-xs)' }}
              >
                Google verbinden
              </a>
            )}
          </div>
        </div>

        {/* Selected Day's Schedule List */}
        <div>
          <div className="mn-sect" style={{ margin: '0 0 var(--mn-s3)' }}>
            <h2>
              {new Date(selectedDate).toLocaleDateString('de-DE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              <small>{totalEntriesForSelected}</small>
            </h2>
            <button
              className="mn-btn mn-btn--primary"
              type="button"
              style={{ minHeight: 36, padding: '0 var(--mn-s3)', fontSize: 'var(--mn-fs-xs)' }}
              onClick={() => handleOpenAddMeetup(selectedDate)}
            >
              + Termin planen
            </button>
          </div>

          {totalEntriesForSelected === 0 ? (
            <div className="mn-empty">
              <p>An diesem Tag sind noch keine Termine oder Fristen eingetragen.</p>
              <button
                className="mn-btn mn-btn--primary"
                type="button"
                onClick={() => handleOpenAddMeetup(selectedDate)}
              >
                Termin oder Treffen anlegen
              </button>
            </div>
          ) : (
            <div className="mn-list">
              {/* Meetups on this day */}
              {selectedDayMeetups.map((m) => {
                const c = contacts.find((cnt) => cnt.id === m.contactId);
                return (
                  <div key={m.id} className="mn-row mn-row--text">
                    <div>
                      <span
                        className="mn-row-title"
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--mn-s2)' }}
                      >
                        🤝 {m.title}
                        {m.completed && (
                          <span className="mn-chip mn-chip--ok" style={{ fontSize: '10px' }}>
                            Erledigt
                          </span>
                        )}
                      </span>
                      <span className="mn-row-sub">
                        {m.time ? `${m.time} Uhr · ` : ''}
                        {m.location ? `${m.location} · ` : ''}
                        {c ? `mit ${c.name}` : ''}
                      </span>
                      {m.preparationNotes && (
                        <p
                          className="mn-muted"
                          style={{ fontSize: 'var(--mn-fs-xs)', margin: '4px 0 0' }}
                        >
                          Vorbereitung: {m.preparationNotes}
                        </p>
                      )}
                    </div>
                    <div className="mn-row-side">
                      <button
                        className="mn-btn mn-btn--ghost"
                        style={{
                          minHeight: 32,
                          padding: '0 var(--mn-s2)',
                          fontSize: 'var(--mn-fs-xs)',
                        }}
                        type="button"
                        onClick={() => onUpdateMeetup({ ...m, completed: !m.completed })}
                      >
                        {m.completed ? 'Wiedereröffnen' : 'Erledigt'}
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Follow-up on this day */}
              {selectedDayFollowUps.map((c) => (
                <div key={c.id} className="mn-row mn-row--text">
                  <div>
                    <span className="mn-row-title">🔔 Nachfassen bei {c.name}</span>
                    <span className="mn-row-sub">
                      {c.followUpNote || 'Anruf oder E-Mail verfassen'}
                    </span>
                  </div>
                  <div className="mn-row-side">
                    <span className="mn-chip mn-chip--warn">Fällig</span>
                  </div>
                </div>
              ))}

              {/* Tasks due on this day */}
              {selectedDayTasks.map((t) => (
                <div key={t.id} className="mn-row mn-row--text">
                  <div>
                    <span className="mn-row-title">☑️ {t.title}</span>
                    <span className="mn-row-sub">
                      Status: {t.column === 'done' ? 'Erledigt' : 'Offen'} · Priorität: {t.priority}
                    </span>
                  </div>
                  <div className="mn-row-side">
                    <span
                      className={`mn-chip ${t.column === 'done' ? 'mn-chip--ok' : 'mn-chip--warn'}`}
                    >
                      {t.column === 'done' ? 'Erledigt' : 'Frist'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MEETUP CREATION MODAL */}
      {isMeetupModalOpen && (
        <div className="mn-overlay" onClick={() => setIsMeetupModalOpen(false)}>
          <div
            className="mn-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mn-sheet-bar">
              <button
                className="mn-btn mn-btn--ghost"
                type="button"
                onClick={() => setIsMeetupModalOpen(false)}
              >
                Abbrechen
              </button>
              <h2>{editingMeetup ? 'Termin bearbeiten' : 'Neues Treffen planen'}</h2>
              <span />
            </div>

            <form onSubmit={handleSaveMeetup} className="mn-sheet-body mn-form">
              <fieldset>
                <legend>Termindetails</legend>
                <label className="mn-field">
                  Titel / Anlass *
                  <input
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="z. B. Projekt-Kickoff oder Geburtstags-Kaffee"
                  />
                </label>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Mit Kontakt
                    <select
                      value={formContactId}
                      onChange={(e) => setFormContactId(e.target.value)}
                    >
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mn-field">
                    Datum *
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                    />
                  </label>
                </div>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Uhrzeit
                    <input
                      type="time"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                    />
                  </label>

                  <label className="mn-field">
                    Ort
                    <input
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      placeholder="z. B. Café Glockenspiel oder Zoom"
                    />
                  </label>
                </div>

                <label className="mn-field">
                  Vorbereitung / Notizen
                  <textarea
                    rows={3}
                    value={formPrepNotes}
                    onChange={(e) => setFormPrepNotes(e.target.value)}
                    placeholder="Unterlagen mitbringen, Gesprächsthemen..."
                  />
                </label>
              </fieldset>

              <div className="mn-sheet-foot">
                <button
                  className="mn-btn mn-btn--ghost"
                  type="button"
                  onClick={() => setIsMeetupModalOpen(false)}
                >
                  Abbrechen
                </button>
                <div className="mn-grow" />
                <button className="mn-btn mn-btn--primary" type="submit">
                  {editingMeetup ? 'Speichern' : 'Termin eintragen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
