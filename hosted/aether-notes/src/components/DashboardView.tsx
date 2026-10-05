/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import type { Contact, KanbanTask, Meetup, Note, Routine, UserSettings } from '../types';

interface DashboardViewProps {
  settings: UserSettings;
  notes: Note[];
  routines: Routine[];
  toggleRoutine: (id: string) => void;
  onNoteClick: (note: Note) => void;
  onNavigateToTab: (
    tab: 'dashboard' | 'library' | 'routines' | 'people' | 'contacts' | 'settings' | 'kanban',
  ) => void;
  onAddQuickRoutine: () => void;
  contacts?: Contact[];
  meetups?: Meetup[];
  kanbanTasks?: KanbanTask[];
}

export default function DashboardView({
  settings,
  notes,
  routines,
  toggleRoutine,
  onNoteClick,
  onNavigateToTab,
  onAddQuickRoutine,
  contacts = [],
  meetups = [],
  kanbanTasks = [],
}: DashboardViewProps) {
  const { t, language } = useTranslation();

  // Get time of day greeting
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (language === 'de') {
      if (hours < 12) return `Guten Morgen, ${settings.userName}.`;
      if (hours < 17) return `Guten Tag, ${settings.userName}.`;
      return `Guten Abend, ${settings.userName}.`;
    } else {
      if (hours < 12) return `Good Morning, ${settings.userName}.`;
      if (hours < 17) return `Good Afternoon, ${settings.userName}.`;
      return `Good Evening, ${settings.userName}.`;
    }
  };

  // Get greeting subtitle based on hour
  const getSubtitle = () => {
    const hours = new Date().getHours();
    if (language === 'de') {
      if (hours < 12) {
        return 'Die Luft ist frisch. Atmen Sie tief ein, brühen Sie sich eine warme Tasse Kaffee auf und lassen Sie Ihre Gedanken heute auf der Seite freien Lauf.';
      }
      if (hours < 17) {
        return 'Die Sonne steht warm und hoch. Machen Sie eine achtsame Pause, verlangsamen Sie Ihr Tempo und reflektieren Sie die Momente Ihres Nachmittags.';
      }
      return 'Das Licht wird sanfter. Lassen Sie den Tag ausklingen, zählen Sie Ihre stillen Funken der Dankbarkeit und genießen Sie die Stille des Abends.';
    } else {
      if (hours < 12) {
        return 'The air is crisp. Take a deep breath, brew a warm cup of coffee, and let your thoughts unfold onto the page today.';
      }
      if (hours < 17) {
        return 'The sun is warm and high. Take a mindful pause, slow down your pace, and reflect on the moments of your afternoon.';
      }
      return 'The light begins to soften. Wind down your day, count your quiet sparks of gratitude, and enjoy the silence of evening.';
    }
  };

  // Calculate upcoming reminders & follow-ups across CRM and Tasks
  const reminders = useMemo(() => {
    const list: {
      id: string;
      type: 'contact' | 'meetup' | 'task';
      title: string;
      subtitle?: string;
      date: string;
      status: 'overdue' | 'today' | 'tomorrow' | 'upcoming';
      statusText: string;
      targetTab: 'contacts' | 'kanban';
    }[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. CRM Contacts Follow-Ups
    contacts.forEach((c) => {
      if (c.followUpDate) {
        const target = new Date(c.followUpDate);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 14) {
          let status: 'overdue' | 'today' | 'tomorrow' | 'upcoming' = 'upcoming';
          let statusText = `${c.followUpDate}`;
          if (diffDays < 0) {
            status = 'overdue';
            statusText = t('overdue', 'Overdue');
          } else if (diffDays === 0) {
            status = 'today';
            statusText = t('dueToday', 'Due Today');
          } else if (diffDays === 1) {
            status = 'tomorrow';
            statusText = t('dueTomorrow', 'Tomorrow');
          } else {
            statusText = language === 'de' ? `In ${diffDays} T.` : `In ${diffDays}d`;
          }

          list.push({
            id: `c-fu-${c.id}`,
            type: 'contact',
            title: c.name,
            subtitle:
              c.followUpNote ||
              (c.company
                ? `${c.role ? `${c.role} · ` : ''}${c.company}`
                : language === 'de'
                  ? 'Wiedervorlage / Kontakt aufnehmen'
                  : 'Follow-up touchpoint'),
            date: c.followUpDate,
            status,
            statusText,
            targetTab: 'contacts',
          });
        }
      }
    });

    // 2. Scheduled Meetups
    meetups.forEach((m) => {
      if (!m.completed && m.date) {
        const target = new Date(m.date);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= -1 && diffDays <= 14) {
          let status: 'overdue' | 'today' | 'tomorrow' | 'upcoming' = 'upcoming';
          let statusText = m.date;
          if (diffDays < 0) {
            status = 'overdue';
            statusText = t('overdue', 'Overdue');
          } else if (diffDays === 0) {
            status = 'today';
            statusText = t('dueToday', 'Today');
          } else if (diffDays === 1) {
            status = 'tomorrow';
            statusText = t('dueTomorrow', 'Tomorrow');
          } else {
            statusText = language === 'de' ? `In ${diffDays} T.` : `In ${diffDays}d`;
          }

          const ids = m.contactIds || (m.contactId ? [m.contactId] : []);
          const contactNames = ids
            .map((cid) => contacts.find((c) => c.id === cid)?.name)
            .filter(Boolean);
          const withName = contactNames.join(', ');

          list.push({
            id: `m-mu-${m.id}`,
            type: 'meetup',
            title: m.title || (language === 'de' ? `Treffen: ${withName}` : `Meetup: ${withName}`),
            subtitle: `${m.time ? `${m.time} · ` : ''}${m.location || (language === 'de' ? 'Ort unbestimmt' : 'Location unassigned')}${withName ? ` (${withName})` : ''}`,
            date: m.date,
            status,
            statusText,
            targetTab: 'contacts',
          });
        }
      }
    });

    // 3. Kanban Task Deadlines
    kanbanTasks.forEach((task) => {
      if (task.column !== 'done' && task.dueDate) {
        const target = new Date(task.dueDate);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 14) {
          let status: 'overdue' | 'today' | 'tomorrow' | 'upcoming' = 'upcoming';
          let statusText = task.dueDate;
          if (diffDays < 0) {
            status = 'overdue';
            statusText = t('overdue', 'Overdue');
          } else if (diffDays === 0) {
            status = 'today';
            statusText = t('dueToday', 'Due Today');
          } else if (diffDays === 1) {
            status = 'tomorrow';
            statusText = t('dueTomorrow', 'Tomorrow');
          } else {
            statusText = language === 'de' ? `In ${diffDays} T.` : `In ${diffDays}d`;
          }

          list.push({
            id: `k-task-${task.id}`,
            type: 'task',
            title: task.title,
            subtitle:
              task.description ||
              (language === 'de' ? `Status: ${task.column}` : `Status: ${task.column}`),
            date: task.dueDate,
            status,
            statusText,
            targetTab: 'kanban',
          });
        }
      }
    });

    const statusWeight = { overdue: 0, today: 1, tomorrow: 2, upcoming: 3 };
    return list.sort((a, b) => {
      if (statusWeight[a.status] !== statusWeight[b.status]) {
        return statusWeight[a.status] - statusWeight[b.status];
      }
      return a.date.localeCompare(b.date);
    });
  }, [contacts, meetups, kanbanTasks, language, t]);

  // Select top 3 notes for Recent Thoughts bento grid
  const recentThoughts = notes.slice(0, 3);
  const largeNote = recentThoughts[0];
  const squareNote1 = recentThoughts[1];
  const squareNote2 = recentThoughts[2];

  // Pick top 3 routines for Today's Rituals list
  const rituals = routines.slice(0, 3);

  const urgentRemindersCount = reminders.filter(
    (r) => r.status === 'overdue' || r.status === 'today',
  ).length;

  return (
    <div className="max-w-4xl mx-auto w-full pt-4 md:pt-10 pb-16 flex flex-col gap-10 md:gap-14 animate-fade-in animate-once">
      {/* Greeting & Atmosphere Hero */}
      <section className="flex flex-col gap-6">
        <div className="space-y-2">
          <h2 className="font-sans text-3xl md:text-4xl text-primary font-bold tracking-tight">
            {getGreeting()}
          </h2>
          <p className="font-serif text-base md:text-lg text-on-surface-variant max-w-2xl leading-relaxed">
            {getSubtitle()}
          </p>
        </div>
      </section>

      {/* Reminders & Follow-Ups Section */}
      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              notifications_active
            </span>
            <h3 className="font-sans text-xl text-on-surface font-semibold tracking-tight">
              {t('upcomingReminders', 'Upcoming Reminders')}
            </h3>
            {urgentRemindersCount > 0 && (
              <span className="bg-error/15 text-error text-[10px] font-bold px-2 py-0.5 rounded-full border border-error/20">
                {urgentRemindersCount}{' '}
                {urgentRemindersCount === 1
                  ? language === 'de'
                    ? 'fällig'
                    : 'due'
                  : language === 'de'
                    ? 'fällig'
                    : 'due'}
              </span>
            )}
          </div>
          <button
            onClick={() => onNavigateToTab('contacts')}
            className="font-sans text-xs font-semibold text-primary hover:underline underline-offset-4 cursor-pointer select-none"
          >
            {t('viewInCrm', 'Open in CRM')}
          </button>
        </div>

        {reminders.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {reminders.slice(0, 6).map((item) => {
              const isOverdue = item.status === 'overdue';
              const isToday = item.status === 'today';

              const badgeStyle = isOverdue
                ? 'bg-error/15 text-error border-error/20'
                : isToday
                  ? 'bg-primary text-on-primary font-bold'
                  : 'bg-secondary/15 text-secondary border-secondary/20';

              const iconName =
                item.type === 'contact'
                  ? 'phone_in_talk'
                  : item.type === 'meetup'
                    ? 'calendar_month'
                    : 'assignment_turned_in';

              return (
                <div
                  key={item.id}
                  onClick={() => onNavigateToTab(item.targetTab)}
                  className={`p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container transition-all cursor-pointer border select-none duration-200 shadow-xs flex flex-col justify-between group ${
                    isOverdue
                      ? 'border-error/25'
                      : isToday
                        ? 'border-primary/25'
                        : 'border-outline-variant/15'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badgeStyle}`}
                      >
                        {item.statusText}
                      </span>
                      <span className="material-symbols-outlined text-sm text-on-surface-variant/50 group-hover:text-primary transition-colors">
                        {iconName}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-sans text-xs font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                        {item.title}
                      </h4>
                      {item.subtitle && (
                        <p className="font-sans text-[11px] text-on-surface-variant/80 mt-0.5 line-clamp-2 leading-relaxed">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-outline-variant/10 flex items-center justify-between text-[10px] text-on-surface-variant/60 font-medium">
                    <span>{item.date}</span>
                    <span className="text-primary font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                      →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-5 bg-surface-container-low/70 rounded-2xl border border-dashed border-outline-variant/30 flex items-center justify-between gap-4 text-xs text-on-surface-variant select-none">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-primary text-base">check_circle</span>
              <span>
                {t(
                  'noUpcomingReminders',
                  'No pending reminders or follow-ups. Everything is in peaceful order.',
                )}
              </span>
            </div>
            <button
              onClick={() => onNavigateToTab('contacts')}
              className="text-[11px] font-bold text-primary hover:underline underline-offset-4 cursor-pointer shrink-0"
            >
              + {language === 'de' ? 'Wiedervorlage planen' : 'Schedule follow-up'}
            </button>
          </div>
        )}
      </section>

      {/* Two Columns Section (Routines / Bento Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Today's Routines Section (5/12 columns on desktop) */}
        <section className="md:col-span-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-sans text-xl text-on-surface font-semibold tracking-tight">
              {language === 'de' ? 'Heutige Rituale' : "Today's Rituals"}
            </h3>
            <button
              onClick={onAddQuickRoutine}
              aria-label="Add routine"
              className="text-primary hover:bg-primary-container/10 p-2 rounded-full transition-all duration-300 cursor-pointer active:scale-90"
            >
              <span className="material-symbols-outlined text-lg">add</span>
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {rituals.map((routine) => (
              <div
                key={routine.id}
                onClick={() => toggleRoutine(routine.id)}
                className="group flex items-start gap-4 p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container transition-all cursor-pointer border border-transparent hover:border-surface-variant/50 select-none duration-200 shadow-sm"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRoutine(routine.id);
                  }}
                  className="mt-0.5 text-primary active:scale-95 transition-transform"
                >
                  <span
                    className={`material-symbols-outlined transition-all text-xl ${routine.completed ? 'text-primary' : 'text-outline-variant group-hover:text-primary/70'}`}
                  >
                    {routine.completed ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </button>
                <div className="flex-1">
                  <p
                    className={`font-sans text-sm font-semibold text-on-surface transition-all ${routine.completed ? 'line-through opacity-60' : ''}`}
                  >
                    {routine.title}
                  </p>
                  <p className="font-sans text-xs text-on-surface-variant mt-0.5 opacity-80">
                    {routine.duration ? `${routine.duration} · ` : ''}
                    {routine.description}
                  </p>
                </div>
              </div>
            ))}
            {rituals.length === 0 && (
              <div className="p-8 text-center bg-surface-container-low rounded-2xl border border-dashed border-outline-variant/50 text-on-surface-variant/70 text-sm">
                {language === 'de'
                  ? 'Keine Rituale für heute geplant.'
                  : 'No rituals scheduled for today.'}
              </div>
            )}
          </div>
        </section>

        {/* Recent Thoughts Grid (7/12 columns on desktop) */}
        <section className="md:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-sans text-xl text-on-surface font-semibold tracking-tight">
              {language === 'de' ? 'Kürzliche Gedanken' : 'Recent Thoughts'}
            </h3>
            <button
              onClick={() => onNavigateToTab('library')}
              className="font-sans text-xs font-semibold text-primary hover:underline underline-offset-4 cursor-pointer select-none"
            >
              {language === 'de' ? 'Alle anzeigen' : 'View All'}
            </button>
          </div>

          {/* Bento Style Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 auto-rows-min">
            {/* Large Wide Card */}
            {largeNote ? (
              <div
                onClick={() => onNoteClick(largeNote)}
                className="col-span-1 sm:col-span-2 bg-surface-container-lowest rounded-2xl p-6 ambient-card-shadow hover:shadow-md transition-shadow duration-300 flex flex-col justify-between cursor-pointer border border-surface-variant/10 group min-h-[160px]"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {largeNote.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-secondary/10 text-primary text-[10px] font-sans font-semibold rounded-full uppercase tracking-wider select-none text-center"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="font-sans text-[10px] text-outline/65">
                      {new Date(largeNote.createdAt).toLocaleDateString(
                        language === 'de' ? 'de-DE' : undefined,
                        {
                          month: 'short',
                          day: 'numeric',
                        },
                      )}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-sans font-bold text-base text-on-surface mb-2 tracking-tight group-hover:text-primary transition-colors">
                      {largeNote.title}
                    </h4>
                    <p className="font-serif text-xs md:text-sm text-on-surface-variant line-clamp-3 leading-relaxed">
                      {largeNote.content}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="col-span-1 sm:col-span-2 p-10 bg-surface-container-low text-center rounded-2xl border border-dashed border-outline-variant/40 text-sm text-on-surface-variant/80">
                {language === 'de'
                  ? 'Ihr Gedankenspeicher ist leer. Klicken Sie auf Neue Notiz, um zu beginnen.'
                  : 'Your sandbox of thoughts is empty. Click New Note to begin.'}
              </div>
            )}

            {/* Square Card 1 */}
            {squareNote1 && (
              <div
                onClick={() => onNoteClick(squareNote1)}
                className="bg-surface-container-lowest rounded-2xl p-5 ambient-card-shadow hover:shadow-md transition-shadow duration-300 flex flex-col justify-between cursor-pointer border border-surface-variant/10 relative overflow-hidden group min-h-[160px]"
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full pointer-events-none"></div>
                <div>
                  <div className="flex items-center gap-1 flex-wrap mb-3.5">
                    {squareNote1.tags.slice(0, 1).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-secondary/10 text-primary text-[9px] font-semibold rounded-full select-none"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h4 className="font-sans font-bold text-sm text-on-surface mb-2 tracking-tight line-clamp-2 group-hover:text-primary transition-colors">
                    {squareNote1.title}
                  </h4>
                  <p className="font-serif text-xs text-on-surface-variant line-clamp-3 leading-relaxed">
                    {squareNote1.content}
                  </p>
                </div>
                <span className="font-sans text-[10px] text-outline/65 mt-4 self-start select-none">
                  {new Date(squareNote1.createdAt).toLocaleDateString(
                    language === 'de' ? 'de-DE' : undefined,
                    {
                      month: 'short',
                      day: 'numeric',
                    },
                  )}
                </span>
              </div>
            )}

            {/* Square Card 2 */}
            {squareNote2 && (
              <div
                onClick={() => onNoteClick(squareNote2)}
                className="bg-surface-container-lowest rounded-2xl p-5 ambient-card-shadow hover:shadow-md transition-shadow duration-300 flex flex-col justify-between cursor-pointer border border-surface-variant/10 group min-h-[160px]"
              >
                <div>
                  <div className="flex items-center gap-1 flex-wrap mb-3.5">
                    {squareNote2.tags.slice(0, 1).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-secondary/10 text-primary text-[9px] font-semibold rounded-full select-none"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h4 className="font-sans font-bold text-sm text-on-surface mb-2 tracking-tight line-clamp-2 group-hover:text-primary transition-colors">
                    {squareNote2.title}
                  </h4>
                  <p className="font-serif text-xs text-on-surface-variant line-clamp-3 leading-relaxed">
                    {squareNote2.content}
                  </p>
                </div>
                <span className="font-sans text-[10px] text-outline/65 mt-4 self-start select-none">
                  {new Date(squareNote2.createdAt).toLocaleDateString(
                    language === 'de' ? 'de-DE' : undefined,
                    {
                      month: 'short',
                      day: 'numeric',
                    },
                  )}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
