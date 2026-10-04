/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import type { Contact, KanbanTask, Meetup, Note, Routine, UserSettings } from '../types';

interface HeuteViewProps {
  settings: UserSettings;
  contacts: Contact[];
  meetups: Meetup[];
  tasks: KanbanTask[];
  notes: Note[];
  routines: Routine[];
  onToggleRoutine: (id: string) => void;
  onCompleteFollowUp: (contact: Contact) => void;
  onCompleteMeetup: (meetup: Meetup) => void;
  onCompleteTask: (task: KanbanTask) => void;
  onOpenContact: (contact: Contact) => void;
  onOpenNote: (note: Note) => void;
  onNavigateToTab: (tab: any) => void;
  onNewContact: () => void;
  onNewNote: () => void;
  onNewTask: () => void;
  onNewMeetup: () => void;
}

export default function HeuteView({
  settings,
  contacts,
  meetups,
  tasks,
  notes,
  routines,
  onToggleRoutine,
  onCompleteFollowUp,
  onCompleteMeetup,
  onCompleteTask,
  onOpenContact,
  onOpenNote,
  onNavigateToTab,
  onNewContact,
  onNewNote,
  onNewTask,
  onNewMeetup,
}: HeuteViewProps) {
  // Greet based on hour
  const greeting = useMemo(() => {
    const hours = new Date().getHours();
    if (hours < 12) return `Guten Morgen, ${settings.userName}`;
    if (hours < 17) return `Guten Tag, ${settings.userName}`;
    return `Guten Abend, ${settings.userName}`;
  }, [settings.userName]);

  // Reminders aggregation
  const reminders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const list: {
      id: string;
      kind: 'contact' | 'meetup' | 'task';
      title: string;
      sub: string;
      dateStr: string;
      status: 'overdue' | 'today' | 'tomorrow' | 'soon';
      statusText: string;
      item: any;
    }[] = [];

    // 1. Follow-up from contacts
    contacts.forEach((c) => {
      if (c.followUpDate) {
        const target = new Date(c.followUpDate);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 14) {
          let status: 'overdue' | 'today' | 'tomorrow' | 'soon' = 'soon';
          let statusText = c.followUpDate;
          if (diffDays < 0) {
            status = 'overdue';
            statusText = 'Überfällig';
          } else if (diffDays === 0) {
            status = 'today';
            statusText = 'Heute fällig';
          } else if (diffDays === 1) {
            status = 'tomorrow';
            statusText = 'Morgen';
          } else {
            statusText = `In ${diffDays} Tagen`;
          }

          list.push({
            id: `fu-${c.id}`,
            kind: 'contact',
            title: c.name,
            sub:
              c.followUpNote ||
              (c.company ? `Nachfassen bei ${c.company}` : 'Wiedervorlage / Anruf'),
            dateStr: c.followUpDate,
            status,
            statusText,
            item: c,
          });
        }
      }
    });

    // 2. Upcoming meetups / dates
    meetups.forEach((m) => {
      if (!m.completed && m.date) {
        const target = new Date(m.date);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= -2 && diffDays <= 14) {
          let status: 'overdue' | 'today' | 'tomorrow' | 'soon' = 'soon';
          let statusText = m.date;
          if (diffDays < 0) {
            status = 'overdue';
            statusText = 'Überfällig';
          } else if (diffDays === 0) {
            status = 'today';
            statusText = 'Heute';
          } else if (diffDays === 1) {
            status = 'tomorrow';
            statusText = 'Morgen';
          } else {
            statusText = `In ${diffDays} Tagen`;
          }

          const cName = contacts.find((c) => c.id === m.contactId)?.name || 'Kontakt';
          list.push({
            id: `mu-${m.id}`,
            kind: 'meetup',
            title: m.title || `Treffen mit ${cName}`,
            sub: `${m.time ? `${m.time} Uhr · ` : ''}${m.location || 'Ort offen'} (${cName})`,
            dateStr: m.date,
            status,
            statusText,
            item: m,
          });
        }
      }
    });

    // 3. Due tasks
    tasks.forEach((t) => {
      if (t.column !== 'done' && t.dueDate) {
        const target = new Date(t.dueDate);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 14) {
          let status: 'overdue' | 'today' | 'tomorrow' | 'soon' = 'soon';
          let statusText = t.dueDate;
          if (diffDays < 0) {
            status = 'overdue';
            statusText = 'Überfällig';
          } else if (diffDays === 0) {
            status = 'today';
            statusText = 'Heute fällig';
          } else if (diffDays === 1) {
            status = 'tomorrow';
            statusText = 'Morgen';
          } else {
            statusText = `In ${diffDays} Tagen`;
          }

          list.push({
            id: `task-${t.id}`,
            kind: 'task',
            title: t.title,
            sub: t.description || `Priorität: ${t.priority}`,
            dateStr: t.dueDate,
            status,
            statusText,
            item: t,
          });
        }
      }
    });

    const weight = { overdue: 0, today: 1, tomorrow: 2, soon: 3 };
    return list.sort((a, b) => {
      if (weight[a.status] !== weight[b.status]) {
        return weight[a.status] - weight[b.status];
      }
      return a.dateStr.localeCompare(b.dateStr);
    });
  }, [contacts, meetups, tasks]);

  // Open tasks count
  const openTasksCount = tasks.filter((t) => t.column !== 'done').length;
  const completedRoutines = routines.filter((r) => r.completed).length;

  return (
    <div className="mn-heute-view">
      {/* Dynamic Greeting */}
      <div style={{ marginBottom: 'var(--mn-s6)' }}>
        <h2 style={{ margin: '0 0 var(--mn-s1)', fontSize: 'var(--mn-fs-2xl)' }}>{greeting}</h2>
        <p className="mn-muted" style={{ margin: 0 }}>
          {reminders.length > 0
            ? `Du hast ${reminders.length} anstehende ${reminders.length === 1 ? 'Erinnerung' : 'Erinnerungen & Termine'}.`
            : 'Alles erledigt – keine offenen Termine oder fälligen Nachfass-Aktionen.'}
        </p>
      </div>

      {/* MiniNode KPIs */}
      <div className="mn-kpis">
        <div className="mn-kpi">
          <b className="mn-num">{reminders.length}</b>
          <span>Erinnerungen fällig</span>
        </div>
        <div className="mn-kpi">
          <b className="mn-num">{openTasksCount}</b>
          <span>Offene Aufgaben</span>
        </div>
        <div className="mn-kpi">
          <b className="mn-num">{contacts.length}</b>
          <span>Gespeicherte Kontakte</span>
        </div>
        <div className="mn-kpi">
          <b className="mn-num">{settings.streakDays} Tage</b>
          <span>Achtsamkeits-Serie</span>
        </div>
      </div>

      {/* Section: Fällige Erinnerungen, Termine & Treffen */}
      <div className="mn-sect">
        <h2>
          Erinnerungen & Termine
          <small>{reminders.length}</small>
        </h2>
        <div style={{ display: 'flex', gap: 'var(--mn-s2)' }}>
          <button className="mn-link" type="button" onClick={onNewMeetup}>
            + Treffen planen
          </button>
        </div>
      </div>

      {reminders.length === 0 ? (
        <div className="mn-empty">
          <div className="mn-empty-icon">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h3>Keine fälligen Erinnerungen</h3>
          <p>Alle Nachfass-Termine, Treffen und Aufgaben-Fristen sind auf dem neuesten Stand.</p>
          <button className="mn-btn mn-btn--primary" type="button" onClick={onNewMeetup}>
            Treffen oder Termin anlegen
          </button>
        </div>
      ) : (
        <div className="mn-list">
          {reminders.map((rem) => {
            const chipClass =
              rem.status === 'overdue'
                ? 'mn-chip mn-chip--bad'
                : rem.status === 'today'
                  ? 'mn-chip mn-chip--warn'
                  : 'mn-chip';

            const initials = rem.title.slice(0, 2).toUpperCase();

            return (
              <div key={rem.id} className="mn-row">
                <span className="mn-thumb" aria-hidden="true">
                  {initials}
                </span>

                <div
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    if (rem.kind === 'contact') onOpenContact(rem.item);
                    else if (rem.kind === 'meetup') onNavigateToTab('kalender');
                    else if (rem.kind === 'task') onNavigateToTab('aufgaben');
                  }}
                >
                  <span className="mn-row-title">{rem.title}</span>
                  <span className="mn-row-sub">{rem.sub}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--mn-s3)' }}>
                  <span className={chipClass}>{rem.statusText}</span>

                  <button
                    className="mn-btn mn-btn--ghost"
                    style={{
                      minHeight: '36px',
                      padding: '0 var(--mn-s2)',
                      fontSize: 'var(--mn-fs-xs)',
                    }}
                    type="button"
                    title="Als erledigt markieren"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (rem.kind === 'contact') onCompleteFollowUp(rem.item);
                      else if (rem.kind === 'meetup') onCompleteMeetup(rem.item);
                      else if (rem.kind === 'task') onCompleteTask(rem.item);
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{ width: 16, height: 16 }}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Erledigt
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Section: Tages-Rhythmen & Routinen */}
      <div className="mn-sect">
        <h2>
          Tägliche Routinen
          <small>
            {completedRoutines}/{routines.length}
          </small>
        </h2>
      </div>

      <div className="mn-card">
        {routines.length === 0 ? (
          <p className="mn-note">Noch keine Routinen eingetragen.</p>
        ) : (
          <div className="mn-checks">
            {routines.map((r) => (
              <label key={r.id}>
                <input
                  type="checkbox"
                  checked={r.completed}
                  onChange={() => onToggleRoutine(r.id)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      textDecoration: r.completed ? 'line-through' : 'none',
                      color: r.completed ? 'var(--mn-muted)' : 'inherit',
                      fontWeight: 600,
                    }}
                  >
                    {r.title}
                  </span>
                  <small>
                    {r.duration ? `${r.duration} · ` : ''}
                    {r.description}
                  </small>
                </div>
                <span className="mn-chip mn-chip--plain" style={{ fontSize: 'var(--mn-fs-xs)' }}>
                  {r.timeLabel}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Section: Kürzliche Notizen */}
      <div className="mn-sect">
        <h2>
          Kürzliche Notizen
          <small>{notes.length}</small>
        </h2>
        <button className="mn-link" type="button" onClick={() => onNavigateToTab('notizen')}>
          Alle Notizen
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="mn-empty">
          <h3>Noch keine Notizen</h3>
          <p>Halte Gedanken, Gesprächsnotizen und Checklisten fest.</p>
          <button className="mn-btn mn-btn--primary" type="button" onClick={onNewNote}>
            Erste Notiz anlegen
          </button>
        </div>
      ) : (
        <div className="mn-list">
          {notes.slice(0, 3).map((n) => {
            const linkedContact = contacts.find((c) => c.id === n.contactId);
            return (
              <button key={n.id} className="mn-row" type="button" onClick={() => onOpenNote(n)}>
                <span className="mn-thumb" aria-hidden="true">
                  {n.title.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <span className="mn-row-title">{n.title}</span>
                  <span className="mn-row-sub">
                    {linkedContact ? `Mit ${linkedContact.name} · ` : ''}
                    {n.type === 'checklist' && n.checklistItems
                      ? `${n.checklistItems.filter((i) => i.completed).length}/${n.checklistItems.length} erledigt`
                      : n.content}
                  </span>
                </span>
                <span className="mn-row-side">
                  {n.tags && n.tags.length > 0 && <b>#{n.tags[0]}</b>}
                  {new Date(n.createdAt).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Quick Action Tools Bar */}
      <div
        className="mn-card"
        style={{
          marginTop: 'var(--mn-s8)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--mn-s3)',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--mn-fs-md)' }}>Schnell erfassen</h3>
          <p className="mn-muted" style={{ margin: 0, fontSize: 'var(--mn-fs-sm)' }}>
            Einträge direkt in deinem Arbeitsbereich ablegen
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mn-s2)' }}>
          <button className="mn-btn" type="button" onClick={onNewContact}>
            + Kontakt
          </button>
          <button className="mn-btn" type="button" onClick={onNewNote}>
            + Notiz
          </button>
          <button className="mn-btn" type="button" onClick={onNewTask}>
            + Aufgabe
          </button>
          <button className="mn-btn mn-btn--primary" type="button" onClick={onNewMeetup}>
            + Termin
          </button>
        </div>
      </div>
    </div>
  );
}
