/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import { type JournalEntry, type JournalMood, type Note, type Person, TagType } from '../types';

interface NotesLibraryViewProps {
  notes: Note[];
  onNoteClick: (note: Note) => void;
  onNewNoteClick: () => void;
  onToggleChecklistItem?: (noteId: string, itemId: string) => void;
  people: Person[];
  journalEntries: JournalEntry[];
  onAddJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
  onDeleteJournalEntry: (id: string) => void;
}

const STATIC_TAG_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Creative', value: 'Creative' },
  { label: 'Journal', value: 'Journal' },
  { label: 'Work', value: 'Work' },
  { label: 'Planning', value: 'Planning' },
  { label: 'Personal', value: 'Personal' },
  { label: 'Idea', value: 'Idea' },
  { label: 'Draft', value: 'Draft' },
];

const MOODS: {
  value: JournalMood;
  label: string;
  emoji: string;
  colorClass: string;
  textClass: string;
  bgClass: string;
}[] = [
  {
    value: 'peaceful',
    label: 'Peaceful',
    emoji: '🧘',
    colorClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    textClass: 'text-emerald-600',
    bgClass: 'bg-emerald-500',
  },
  {
    value: 'joyful',
    label: 'Joyful',
    emoji: '☀️',
    colorClass: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    textClass: 'text-amber-600',
    bgClass: 'bg-amber-500',
  },
  {
    value: 'reflective',
    label: 'Reflective',
    emoji: '🌲',
    colorClass: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
    textClass: 'text-sky-600',
    bgClass: 'bg-sky-500',
  },
  {
    value: 'neutral',
    label: 'Neutral',
    emoji: '😐',
    colorClass: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400',
    textClass: 'text-slate-600',
    bgClass: 'bg-slate-500',
  },
  {
    value: 'tired',
    label: 'Tired',
    emoji: '☕',
    colorClass: 'border-amber-800/30 bg-amber-800/10 text-amber-800 dark:text-amber-500',
    textClass: 'text-amber-800',
    bgClass: 'bg-amber-800',
  },
  {
    value: 'anxious',
    label: 'Anxious',
    emoji: '🌊',
    colorClass: 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400',
    textClass: 'text-purple-600',
    bgClass: 'bg-purple-500',
  },
];

export default function NotesLibraryView({
  notes,
  onNoteClick,
  onNewNoteClick,
  onToggleChecklistItem,
  people,
  journalEntries,
  onAddJournalEntry,
  onDeleteJournalEntry,
}: NotesLibraryViewProps) {
  const { t } = useTranslation();
  const moodName = (value?: string) => {
    const key =
      {
        peaceful: 'peaceful',
        joyful: 'joyful',
        reflective: 'reflective',
        neutral: 'neutral',
        tired: 'tired',
      }[value ?? ''] ?? 'anxious';
    return t(`notesLibrary.${key}`).toLocaleLowerCase(window.mnI18n.locale);
  };
  // Main view system tab
  const [activeTab, setActiveTab] = useState<'thoughts' | 'journal'>('thoughts');

  // Thought Library Search Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [noteTagFilter, setNoteTagFilter] = useState('all');

  // Journaling Form States
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formPlace, setFormPlace] = useState('');
  const [formMood, setFormMood] = useState<JournalMood>('peaceful');
  const [formPeopleIds, setFormPeopleIds] = useState<string[]>([]);
  const [formText, setFormText] = useState('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Filter thoughts based on search & filter categories
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const matchesSearch =
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        noteTagFilter === 'all' ||
        note.tags.some((tag) => tag.toLowerCase() === noteTagFilter.toLowerCase());

      return matchesSearch && matchesCategory;
    });
  }, [notes, searchQuery, noteTagFilter]);

  // Statistics Computations
  const stats = useMemo(() => {
    const total = journalEntries.length;

    // Journaling Rate: entries in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const countThisWeek = journalEntries.filter(
      (entry) => new Date(entry.date) >= sevenDaysAgo,
    ).length;

    // Mood distribution
    const moodCounts: Record<JournalMood, number> = {
      joyful: 0,
      peaceful: 0,
      neutral: 0,
      reflective: 0,
      tired: 0,
      anxious: 0,
    };
    journalEntries.forEach((entry) => {
      if (moodCounts[entry.mood] !== undefined) {
        moodCounts[entry.mood] += 1;
      }
    });

    // Find dominant mood
    let dominant: JournalMood = 'peaceful';
    let maxCount = -1;
    (Object.keys(moodCounts) as JournalMood[]).forEach((m) => {
      if (moodCounts[m] > maxCount) {
        maxCount = moodCounts[m];
        dominant = m;
      }
    });

    const dominantLabel = MOODS.find((m) => m.value === dominant);

    return {
      total,
      countThisWeek,
      moodCounts,
      dominant,
      dominantLabel,
    };
  }, [journalEntries]);

  // Form people met toggle list helper
  const handleTogglePersonMet = (personId: string) => {
    setFormPeopleIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId],
    );
  };

  // Submission inside the continued workbook
  const handleSignPage = (e: FormEvent) => {
    e.preventDefault();
    if (!formText.trim()) {
      triggerToast(t('notesLibrary.pleaseWriteDownSomeSentences'));
      return;
    }

    onAddJournalEntry({
      date: formDate,
      place: formPlace.trim() || t('notesLibrary.cozyCorner'),
      mood: formMood,
      peopleMetIds: formPeopleIds,
      text: formText.trim(),
    });

    triggerToast(t('notesLibrary.pageSignedBoundInYour'));

    // Clear and reset state
    setFormPlace('');
    setFormText('');
    setFormPeopleIds([]);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormMood('peaceful');
  };

  return (
    <div className="max-w-6xl mx-auto w-full pt-4 md:pt-10 pb-16 flex flex-col gap-6 animate-fade-in duration-300">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-5 right-5 bg-surface-container border-2 border-primary/20 text-on-surface px-5 py-3.5 rounded-2xl flex items-center gap-3 shadow-xl z-50 animate-fade-in font-sans text-xs font-semibold">
          <span className="material-symbols-outlined text-primary text-base">auto_awesome</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Headers & Dual Choice Tab Switches */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/10 pb-4">
        <div>
          <h2 className="font-sans text-3xl text-on-background font-bold tracking-tight flex items-center gap-2">
            {t('notesLibrary.mindfulSpaces')}
          </h2>
          <p className="font-serif text-sm text-on-surface-variant mt-1 opacity-80">
            {activeTab === 'thoughts'
              ? t('notesLibrary.collectScatteredDraftsWorkLists')
              : t('notesLibrary.writeIntoOneContinuousNotebook')}
          </p>
        </div>

        {/* Toggle Panel buttons */}
        <div className="flex bg-surface-container rounded-xl p-1 shrink-0 select-none self-start border border-outline-variant/20">
          <button
            onClick={() => setActiveTab('thoughts')}
            className={`flex items-center gap-2 px-4.5 py-2 rounded-lg font-sans text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'thoughts'
                ? 'bg-surface-bright text-primary shadow-xs'
                : 'text-on-surface-variant/70 hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base">sticky_note_2</span>
            {t('notesLibrary.scatteredNotes')}
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`flex items-center gap-2 px-4.5 py-2 rounded-lg font-sans text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'journal'
                ? 'bg-surface-bright text-primary shadow-xs'
                : 'text-on-surface-variant/70 hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base">menu_book</span>
            {t('notesLibrary.journalingBook')}
            {journalEntries.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary text-[9px] rounded-full">
                {journalEntries.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: SCATTERED NOTES (CLASSIC GRID) */}
      {activeTab === 'thoughts' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Top Options */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Search Input bar */}
            <div className="relative max-w-xl w-full">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-75 text-sm">
                search
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/15 pr-10 pl-11 py-3 rounded-xl outline-none font-sans font-medium text-xs text-on-surface placeholder:text-on-surface-variant/40 transition-all focus:border-primary/50"
                placeholder={t('notesLibrary.searchNotebooksChecklistsOrWork')}
                type="text"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer select-none flex items-center"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </div>

            <button
              onClick={onNewNoteClick}
              className="bg-primary text-on-primary py-3 px-4.5 rounded-xl text-xs font-bold hover:opacity-95 select-none flex items-center gap-1.5 shadow-xs active:scale-95 duration-100 transition-transform cursor-pointer"
            >
              <span className="material-symbols-outlined text-xs font-black">add</span>
              {t('notesLibrary.createReflection')}
            </button>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-1.5 select-none">
            {STATIC_TAG_FILTERS.map((chip) => {
              const isActive = noteTagFilter.toLowerCase() === chip.value.toLowerCase();
              return (
                <button
                  key={chip.value}
                  onClick={() => setNoteTagFilter(chip.value)}
                  className={`px-4 py-1.5 rounded-full font-sans text-xs font-bold cursor-pointer border transition-all duration-200 ${
                    isActive
                      ? 'border-transparent bg-primary text-on-primary shadow-xs scale-95'
                      : 'border-outline-variant/40 text-on-surface-variant bg-surface-container-low hover:bg-surface-container hover:border-outline'
                  }`}
                >
                  {chip.label === 'All'
                    ? t('notesLibrary.all')
                    : chip.label === 'Creative'
                      ? t('notesLibrary.creative')
                      : chip.label === 'Journal'
                        ? t('notesLibrary.journal')
                        : chip.label === 'Work'
                          ? t('notesLibrary.work')
                          : chip.label === 'Planning'
                            ? t('notesLibrary.planning')
                            : chip.label === 'Personal'
                              ? t('notesLibrary.personal')
                              : chip.label === 'Idea'
                                ? t('notesLibrary.idea')
                                : chip.label === 'Draft'
                                  ? t('notesLibrary.draft')
                                  : chip.label}
                </button>
              );
            })}
          </div>

          {/* Notes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[300px]">
            {filteredNotes.map((note) => (
              <article
                key={note.id}
                onClick={() => onNoteClick(note)}
                className={`bg-surface-container-lowest rounded-2xl p-6 flex flex-col gap-4 shadow-xs hover:shadow-md hover:-translate-y-1 select-none cursor-pointer group border transition-all duration-300 ${
                  note.accentBorder
                    ? 'border-l-4 border-l-primary/70 border-t-outline-variant/10 border-r-outline-variant/10 border-b-outline-variant/10'
                    : 'border-outline-variant/10 hover:border-outline-variant/45'
                }`}
              >
                {/* Tag Badge and Options */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 bg-primary/10 text-primary font-sans text-[10px] uppercase tracking-wider font-extrabold rounded-full select-none"
                    >
                      {tag === 'Creative'
                        ? t('notesLibrary.creative')
                        : tag === 'Journal'
                          ? t('notesLibrary.journal')
                          : tag === 'Work'
                            ? t('notesLibrary.work')
                            : tag === 'Planning'
                              ? t('notesLibrary.planning')
                              : tag === 'Personal'
                                ? t('notesLibrary.personal')
                                : tag === 'Idea'
                                  ? t('notesLibrary.idea')
                                  : tag === 'Draft'
                                    ? t('notesLibrary.draft')
                                    : tag}
                    </span>
                  ))}
                </div>

                {/* Note title */}
                <h3 className="font-sans text-sm md:text-base text-on-background font-bold group-hover:text-primary transition-colors leading-snug tracking-tight">
                  {note.title}
                </h3>

                {/* Render conditional content (checklist vs text) */}
                {note.type === 'checklist' ? (
                  <ul className="flex flex-col gap-2.5 mt-1">
                    {note.checklistItems?.slice(0, 4).map((item) => (
                      <li
                        key={item.id}
                        onClick={(e) => {
                          if (onToggleChecklistItem) {
                            e.stopPropagation();
                            onToggleChecklistItem(note.id, item.id);
                          }
                        }}
                        className={`flex items-start gap-2.5 font-sans text-xs leading-normal select-none ${
                          item.completed
                            ? 'text-on-surface-variant/40 line-through'
                            : 'text-on-surface'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-base self-start mt-0.5 ${
                            item.completed
                              ? 'text-primary'
                              : 'text-outline-variant group-hover:text-primary/70'
                          }`}
                        >
                          {item.completed ? 'check_circle' : 'radio_button_unchecked'}
                        </span>
                        <span className="font-medium truncate">{item.text}</span>
                      </li>
                    ))}
                    {(note.checklistItems?.length ?? 0) > 4 && (
                      <li className="text-[10px] text-outline/70 font-sans italic pl-6 mt-0.5">
                        + {(note.checklistItems?.length ?? 0) - 4}{' '}
                        {t('notesLibrary.moreReflections')}
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="font-serif text-sm text-on-surface-variant leading-relaxed line-clamp-4 select-text">
                    {note.content}
                  </p>
                )}

                {/* Date Footer */}
                <div className="mt-auto pt-4 border-t border-outline-variant/10 flex items-center justify-between text-on-surface-variant/50 font-sans text-[10px] font-bold tracking-wide">
                  <span>
                    {new Date(note.createdAt).toLocaleDateString(window.mnI18n.locale, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="material-symbols-outlined text-sm group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                    arrow_right_alt
                  </span>
                </div>
              </article>
            ))}

            {filteredNotes.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-12 text-center bg-surface-container-low/40 rounded-2xl border border-dashed border-outline-variant/40 text-on-surface-variant/80">
                <span className="material-symbols-outlined text-4xl text-outline-variant/80 mb-3">
                  search_off
                </span>
                <p className="font-sans text-sm font-semibold text-on-surface">
                  {t('notesLibrary.noReflectionsMatchedYourSearch')}
                </p>
                <p className="font-sans text-xs text-on-surface-variant/70 mt-1">
                  {t('notesLibrary.tryAdjustingYourKeywordFilter')}
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setNoteTagFilter('all');
                  }}
                  className="mt-4 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer font-sans"
                >
                  {t('notesLibrary.clearFilters')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: THE JOURNALING BOOK (CONTINUOUS MEMOIRS) */}
      {activeTab === 'journal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in relative alignment-start">
          {/* STATS & WRITING AREA COLUMN */}
          <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-4 h-fit">
            {/* COZY STATISTICS BOX */}
            <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 p-5 font-sans space-y-4">
              <h3 className="text-xs uppercase tracking-widest text-primary font-extrabold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">analytics</span>
                {t('notesLibrary.bookInsightsStats')}
              </h3>

              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <div className="p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/10">
                  <span className="block text-[10px] uppercase font-bold text-on-surface-variant/60 leading-none">
                    {t('notesLibrary.totalEntries')}
                  </span>
                  <span className="block text-2xl font-black text-on-surface mt-1.5">
                    {stats.total}
                  </span>
                </div>
                <div className="p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/10">
                  <span className="block text-[10px] uppercase font-bold text-on-surface-variant/60 leading-none">
                    {t('notesLibrary.past7Days')}
                  </span>
                  <span className="block text-2xl font-black text-on-surface mt-1.5">
                    {stats.countThisWeek} {t('notesLibrary.logs')}
                  </span>
                </div>
              </div>

              {/* Dominant Mood Badge and description */}
              {stats.total > 0 && (
                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/10 flex items-center justify-between gap-4 mt-1">
                  <div className="space-y-1">
                    <span className="block text-[9px] uppercase font-bold text-on-surface-variant/60 leading-none">
                      {t('notesLibrary.dominantMood')}
                    </span>
                    <span className="block text-xs font-bold text-on-surface">
                      {t('notesLibrary.feelingMostly', {
                        mood: moodName(stats.dominantLabel?.value),
                      })}
                    </span>
                  </div>
                  <span
                    className="text-3xl bg-surface-container p-2 rounded-full leading-none shrink-0"
                    title={moodName(stats.dominantLabel?.value)}
                  >
                    {stats.dominantLabel?.emoji}
                  </span>
                </div>
              )}

              {/* Mood Breakdown Tracker Grid */}
              <div className="space-y-2 pt-2 border-t border-outline-variant/10">
                <h4 className="text-[10px] uppercase font-extrabold tracking-wider text-on-surface-variant/70">
                  {t('notesLibrary.moodFrequencyBreakdown')}
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {MOODS.map((m) => {
                    const count = stats.moodCounts[m.value] || 0;
                    return (
                      <div
                        key={m.value}
                        className="flex flex-col p-2 bg-surface-container-lowest border border-outline-variant/15 rounded-xl text-center"
                      >
                        <span className="text-lg leading-none mb-1">{m.emoji}</span>
                        <span className="text-[9px] font-bold text-on-surface-variant/80 truncate">
                          {m.value === 'peaceful'
                            ? t('notesLibrary.peaceful')
                            : m.value === 'joyful'
                              ? t('notesLibrary.joyful')
                              : m.value === 'reflective'
                                ? t('notesLibrary.reflective')
                                : m.value === 'neutral'
                                  ? t('notesLibrary.neutral')
                                  : m.value === 'tired'
                                    ? t('notesLibrary.tired')
                                    : t('notesLibrary.anxious')}
                        </span>
                        <span className="text-xs font-black text-on-surface mt-0.5">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SIGN A NEW PAGE BOOK FORM */}
            <form
              onSubmit={handleSignPage}
              className="bg-surface-container-lowest rounded-2xl border-2 border-outline-variant/20 p-6 flex flex-col gap-4 shadow-sm relative"
            >
              <div className="absolute top-0 right-6 w-12 h-1 bg-primary/20 rounded-b-md"></div>

              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-primary text-xl">stylus_note</span>
                <h3 className="font-sans text-sm font-black text-on-surface uppercase tracking-wider">
                  {t('notesLibrary.signANewMemoirPage')}
                </h3>
              </div>

              {/* Layout: Date & Place Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase text-on-surface-variant/70 tracking-wider mb-1.5 font-sans">
                    {t('notesLibrary.chronologyDate')}
                  </label>
                  <input
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    type="date"
                    required
                    className="w-full bg-surface-container border border-outline-variant/15 px-3 py-2 rounded-xl text-xs outline-none focus:outline-primary/45 font-sans font-medium text-on-surface"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase text-on-surface-variant/70 tracking-wider mb-1.5 font-sans">
                    {t('notesLibrary.currentLocation')}
                  </label>
                  <input
                    value={formPlace}
                    onChange={(e) => setFormPlace(e.target.value)}
                    placeholder={t('notesLibrary.eGWorkspaceDesk')}
                    type="text"
                    className="w-full bg-surface-container border border-outline-variant/15 px-3 py-2 rounded-xl text-xs outline-none focus:outline-primary/45 font-sans placeholder:text-on-surface-variant/35 text-on-surface font-medium"
                  />
                </div>
              </div>

              {/* Mood selection box */}
              <div>
                <label className="block text-[9px] font-black uppercase text-on-surface-variant/70 tracking-wider mb-2 font-sans">
                  {t('notesLibrary.dailyHeartMindStateMood')}
                </label>
                <div className="grid grid-cols-3 gap-1.5 select-none text-[10px]">
                  {MOODS.map((m) => {
                    const isSelected = formMood === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setFormMood(m.value)}
                        className={`py-2 px-1.5 rounded-xl border flex items-center justify-center gap-1.5 font-sans font-bold cursor-pointer transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-primary shadow-xs'
                            : 'border-outline-variant/10 bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                        }`}
                      >
                        <span className="text-sm leading-none shrink-0">{m.emoji}</span>
                        <span>
                          {m.value === 'peaceful'
                            ? t('notesLibrary.peaceful')
                            : m.value === 'joyful'
                              ? t('notesLibrary.joyful')
                              : m.value === 'reflective'
                                ? t('notesLibrary.reflective')
                                : m.value === 'neutral'
                                  ? t('notesLibrary.neutral')
                                  : m.value === 'tired'
                                    ? t('notesLibrary.tired')
                                    : t('notesLibrary.anxious')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Companion list (People met dropdown checklist) */}
              <div>
                <label className="block text-[9px] font-black uppercase text-on-surface-variant/70 tracking-wider mb-2 font-sans">
                  {t('notesLibrary.peopleMetTodayLinkedCompanion')}
                </label>
                {people.length === 0 ? (
                  <p className="font-serif italic text-[10px] text-on-surface-variant/60 leading-normal bg-surface-container p-2.5 rounded-xl border border-outline-variant/10">
                    {t('notesLibrary.noActivePeopleProfilesExist')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 select-none">
                    {people.map((person) => {
                      const isSelected = formPeopleIds.includes(person.id);
                      return (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => handleTogglePersonMet(person.id)}
                          className={`font-sans text-[10px] font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl cursor-pointer transition-all border ${
                            isSelected
                              ? 'bg-secondary/15 border-secondary text-primary font-bold'
                              : 'border-outline-variant/15 bg-surface-container text-on-surface-variant hover:bg-surface-container'
                          }`}
                        >
                          <span className="material-symbols-outlined text-xs shrink-0 text-primary">
                            person
                          </span>
                          <span>{person.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Main journal description content */}
              <div>
                <label className="block text-[9px] font-black uppercase text-on-surface-variant/70 tracking-wider mb-1.5 font-sans">
                  {t('notesLibrary.theChronicleEntryReflections')}
                </label>
                <div className="bg-surface-container border border-outline-variant/15 p-1 rounded-xl">
                  <textarea
                    value={formText}
                    onChange={(e) => setFormText(e.target.value)}
                    required
                    rows={6}
                    placeholder={t('notesLibrary.describeHowYourDayBreathed')}
                    className="w-full bg-transparent px-3 py-2 cursor-text outline-none resize-none font-serif text-sm tracking-wide text-on-surface italic placeholder:text-on-surface-variant/40 leading-relaxed"
                  />
                  <div className="flex justify-end p-1 text-[9px] text-on-surface-variant/40 font-mono font-medium">
                    {formText.length} {t('notesLibrary.characters')}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="bg-primary hover:opacity-95 text-on-primary font-sans text-xs font-bold py-3 px-5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 mt-1 select-none active:scale-95 cursor-pointer w-full"
              >
                <span className="material-symbols-outlined text-sm font-bold">draw</span>
                {t('notesLibrary.signInsideBook')}
              </button>
            </form>
          </div>

          {/* CHRONICLES MEMOIRS FEED TIMELINE */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
              <h3 className="font-sans text-sm font-black text-on-background uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">
                  auto_stories
                </span>
                {t('notesLibrary.chroniclesTimeline')}
              </h3>
              <span className="font-mono text-[10px] text-on-surface-variant/50 font-bold bg-surface-container px-2 py-0.5 rounded-md">
                {journalEntries.length} {t('notesLibrary.entriesBound')}
              </span>
            </div>

            {journalEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-8 text-center bg-surface-container-low/30 rounded-2xl border-2 border-dashed border-outline-variant/15">
                <span className="material-symbols-outlined text-4xl text-outline-variant/60 mb-3">
                  auto_stories
                </span>
                <h4 className="font-serif text-sm italic font-bold text-on-surface">
                  {t('notesLibrary.theJournalIsEmpty')}
                </h4>
                <p className="font-sans text-xs text-on-surface-variant/60 max-w-sm mt-1.5 leading-relaxed">
                  {t('notesLibrary.startDraftingObservationsInThe')}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {journalEntries.map((entry) => {
                  const entryMood = MOODS.find((m) => m.value === entry.mood);
                  return (
                    <article
                      key={entry.id}
                      className="bg-surface-container-lowest border border-outline-variant/15 rounded-2xl shadow-sm overflow-hidden p-6 hover:shadow-xs hover:border-outline-variant/30 transition-all duration-300 relative group flex flex-col gap-4 font-serif"
                    >
                      {/* Left color Accent tab indicating state mood */}
                      <div
                        className={`absolute top-0 left-0 bottom-0 w-2.5 ${entryMood?.bgClass || 'bg-primary'}`}
                      ></div>

                      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/10 pb-3 pl-2 shrink-0">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl leading-none">{entryMood?.emoji}</span>
                          <div>
                            <span className="block font-sans text-xs font-black tracking-wide text-on-surface leading-none">
                              {new Date(entry.date).toLocaleDateString(window.mnI18n.locale, {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            <span className="block text-[10px] text-on-surface-variant/50 font-sans font-semibold mt-1 leading-none">
                              📍 {entry.place}
                            </span>
                          </div>
                        </div>

                        {/* Badges/Mood label tag */}
                        <div className="flex items-center gap-1.5 select-none">
                          <span
                            className={`px-2.5 py-0.5 rounded-full border font-sans text-[9px] uppercase tracking-wider font-extrabold leading-none ${entryMood?.colorClass}`}
                          >
                            {entryMood?.value === 'peaceful'
                              ? t('notesLibrary.peaceful')
                              : entryMood?.value === 'joyful'
                                ? t('notesLibrary.joyful')
                                : entryMood?.value === 'reflective'
                                  ? t('notesLibrary.reflective')
                                  : entryMood?.value === 'neutral'
                                    ? t('notesLibrary.neutral')
                                    : entryMood?.value === 'tired'
                                      ? t('notesLibrary.tired')
                                      : t('notesLibrary.anxious')}
                          </span>
                        </div>
                      </header>

                      {/* Memoir Main Text copyable with standard spacing */}
                      <p className="text-sm md:text-base leading-relaxed text-on-surface hover:text-on-surface italic tracking-wide pl-2 select-text font-serif whitespace-pre-wrap">
                        "{entry.text}"
                      </p>

                      {/* Footer Met companions & Delete operations */}
                      <footer className="flex flex-wrap sm:items-center justify-between gap-4 mt-2 pt-3 border-t border-outline-variant/10 pl-2 shrink-0 font-sans text-xs">
                        {/* Met profile lists */}
                        <div className="flex flex-wrap items-center gap-2">
                          {entry.peopleMetIds.length > 0 ? (
                            <div className="flex gap-1.5 items-center">
                              <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest leading-none">
                                {t('notesLibrary.companions')}
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {entry.peopleMetIds.map((pid) => {
                                  const matchingPerson = people.find((p) => p.id === pid);
                                  const personName = matchingPerson
                                    ? matchingPerson.name
                                    : 'Unknown Friend';
                                  return (
                                    <span
                                      key={pid}
                                      className="inline-flex items-center gap-1 text-[9px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-md border border-outline-variant/10"
                                    >
                                      <span className="w-1.5 h-1.5 bg-secondary rounded-full"></span>
                                      {personName}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[9px] font-bold italic text-on-surface-variant/40 uppercase tracking-wider leading-none">
                              {t('notesLibrary.solitaryMeditationPage')}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t('notesLibrary.tearThisSignedPageOut'))) {
                              onDeleteJournalEntry(entry.id);
                              triggerToast(t('notesLibrary.memoirPageRippedOutOf'));
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-error text-on-surface-variant/50 p-1 rounded-full hover:bg-surface-container transition-all active:scale-90 shrink-0 flex items-center justify-center gap-1 font-sans text-[10px] font-bold cursor-pointer"
                          title={t('notesLibrary.deleteEntry')}
                        >
                          <span className="material-symbols-outlined text-sm">content_cut</span>
                          {t('notesLibrary.tearPage')}
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
