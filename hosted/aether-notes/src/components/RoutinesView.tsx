/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import type { Routine, RoutineTimeOfDay } from '../types';

interface RoutinesViewProps {
  routines: Routine[];
  toggleRoutine: (id: string) => void;
  onAddRoutine: (routine: Omit<Routine, 'id' | 'completed'>) => void;
  onDeleteRoutine: (id: string) => void;
  streakCount: number;
  onStartNewDay: (completedAll: boolean) => void;
}

export default function RoutinesView({
  routines,
  toggleRoutine,
  onAddRoutine,
  onDeleteRoutine,
  streakCount,
  onStartNewDay,
}: RoutinesViewProps) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showNewDayModal, setShowNewDayModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeOfDay, setTimeOfDay] = useState<RoutineTimeOfDay>('Morning');
  const [timeLabel, setTimeLabel] = useState('');
  const [duration, setDuration] = useState('');

  // Calculate stats
  const totalRoutines = routines.length;
  const completedRoutines = routines.filter((r) => r.completed).length;
  const progressPercent =
    totalRoutines > 0 ? Math.round((completedRoutines / totalRoutines) * 100) : 0;

  // Group routines by time of day
  const morningRoutines = routines.filter((r) => r.timeOfDay === 'Morning');
  const afternoonRoutines = routines.filter((r) => r.timeOfDay === 'Afternoon');
  const eveningRoutines = routines.filter((r) => r.timeOfDay === 'Evening');

  // Submit routine
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onAddRoutine({
      title,
      description: description || 'Routine block',
      timeOfDay,
      timeLabel: timeLabel || '12:00 PM',
      duration: duration || '10 mins',
    });

    // Reset Form
    setTitle('');
    setDescription('');
    setTimeOfDay('Morning');
    setTimeLabel('');
    setDuration('');
    setShowAddForm(false);
  };

  const renderRoutineCard = (routine: Routine) => {
    return (
      <div
        key={routine.id}
        onClick={() => toggleRoutine(routine.id)}
        className={`bg-surface-bright rounded-2xl p-4 flex items-center justify-between group cursor-pointer transition-all border duration-200 ${
          routine.completed
            ? 'bg-surface hover:bg-surface-container-low border-transparent opacity-80'
            : 'sunlight-shadow border-outline-variant/20 hover:border-primary/20 hover:bg-surface-container-low'
        }`}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleRoutine(routine.id);
            }}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer ${
              routine.completed
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant hover:border-primary'
            }`}
          >
            {routine.completed && (
              <span className="material-symbols-outlined text-[13px] font-bold">check</span>
            )}
          </button>
          <div>
            <h4
              className={`font-sans text-sm font-semibold text-on-surface transition-all ${
                routine.completed ? 'line-through opacity-60' : ''
              }`}
            >
              {routine.title}
            </h4>
            <p
              className={`font-sans text-xs text-on-surface-variant mt-0.5 ${
                routine.completed ? 'opacity-60' : ''
              }`}
            >
              {routine.duration ? `${routine.duration} · ` : ''}
              {routine.description}
            </p>
          </div>
        </div>

        {/* Time Badge or Circular Progress SVG ring for pending Deep Work / Hour blocks */}
        <div className="flex items-center gap-3 select-none">
          {!routine.completed && routine.id === 'routine-3' && (
            <div className="w-8 h-8 relative flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90 animate-pulse" viewBox="0 0 36 36">
                <path
                  className="text-surface-variant stroke-current"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeWidth="3.2"
                ></path>
                <path
                  className="text-primary stroke-current"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeWidth="3.2"
                  strokeDasharray="60, 100"
                ></path>
              </svg>
            </div>
          )}
          <span
            className={`font-sans text-[10px] font-bold tracking-wider rounded-full px-2.5 py-1 ${
              routine.completed
                ? 'text-on-surface-variant/40 bg-surface-container/30 uppercase'
                : 'text-primary bg-primary-container/10 border border-primary/5 uppercase'
            }`}
          >
            {routine.timeLabel}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRoutine(routine.id);
            }}
            className="md:opacity-0 group-hover:opacity-100 p-1.5 hover:bg-error/10 hover:text-error rounded-full transition-all text-on-surface-variant/60 cursor-pointer flex items-center justify-center active:scale-90"
            title={t('routines.delete')}
          >
            <span className="material-symbols-outlined text-[16px] font-bold">delete</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto w-full pt-4 md:pt-10 pb-16 flex flex-col gap-10 animate-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans text-3xl text-on-surface font-bold tracking-tight">
            {t('routines.dailyRhythms')}
          </h2>
          <p className="font-serif text-sm text-on-surface-variant mt-1.5 opacity-85">
            {t('routines.aGentleSchedulesChecklistDesigned')}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-sm transition-all duration-200 cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-sm">{showAddForm ? 'close' : 'add'}</span>
          {showAddForm ? t('routines.cancelRoutine') : t('routines.addRoutine')}
        </button>
      </header>

      {/* Progress Card Section */}
      <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="space-y-1.5 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
            <h4 className="font-sans text-sm font-bold text-primary uppercase tracking-wider">
              {t('routines.todaySClarity')}
            </h4>
            <div className="flex items-center justify-center gap-1 px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold w-fit mx-auto sm:mx-0">
              <span
                className="material-symbols-outlined text-[12px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                local_fire_department
              </span>
              <span>
                {streakCount} {t('routines.dayStreak')}
              </span>
            </div>
          </div>
          <p className="font-serif text-sm text-on-surface-variant max-w-sm">
            {totalRoutines === 0
              ? t('routines.youHavenTDefinedAny')
              : t('routines.youVeCompletedOfYour', { completedRoutines, totalRoutines })}
          </p>
        </div>

        {/* SVG Progress Circle & Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0 w-full sm:w-auto justify-center sm:justify-end">
          <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              {/* Background circle */}
              <circle cx="18" cy="18" r="15.915" fill="none" stroke="#eae8e5" strokeWidth="3.5" />
              {/* Progress indicator circle */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="#535845"
                strokeWidth="3.5"
                strokeDasharray={`${progressPercent}, 100`}
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-xs font-bold text-primary font-sans leading-none">
                {progressPercent}%
              </span>
            </div>
          </div>

          {totalRoutines > 0 && (
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              {completedRoutines === totalRoutines ? (
                <button
                  type="button"
                  onClick={() => setShowNewDayModal(true)}
                  className="bg-primary hover:bg-primary/95 text-on-primary text-xs font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer animate-pulse"
                >
                  <span className="material-symbols-outlined text-xs">celebration</span>
                  {t('routines.startNextDay')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewDayModal(true)}
                  className="bg-surface border border-outline-variant/30 hover:bg-surface-container text-on-surface-variant text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">skip_next</span>
                  {t('routines.newDayReset')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Routine Custom Creator Form drawer */}
      {showAddForm && (
        <form
          onSubmit={handleSubmit}
          className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/30 flex flex-col gap-4 animate-fade-in"
        >
          <h3 className="font-sans text-sm font-bold text-primary">
            {t('routines.newMindfulRoutine')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                {t('routines.titleName')}
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('routines.eGTenMinuteYoga')}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                {t('routines.descriptionMindfulPrompt')}
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('routines.eGInhaleWarmSun')}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                {t('routines.timelineBlock')}
              </label>
              <select
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value as RoutineTimeOfDay)}
                className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary text-on-surface"
              >
                <option value="Morning">{t('routines.morning')}</option>
                <option value="Afternoon">{t('routines.afternoon')}</option>
                <option value="Evening">{t('routines.evening')}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                  {t('routines.timeLabel')}
                </label>
                <input
                  value={timeLabel}
                  onChange={(e) => setTimeLabel(e.target.value)}
                  placeholder="6:30 AM"
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1 font-sans">
                  {t('routines.durationMins')}
                </label>
                <input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder={t('routines.durationPlaceholder')}
                  className="w-full bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 rounded-xl text-sm font-sans focus:outline-primary placeholder:text-on-surface-variant/40"
                />
              </div>
            </div>
          </div>
          <button
            type="submit"
            className="self-end bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold px-5 py-2.5 rounded-xl transition-all cursor-pointer"
          >
            {t('routines.scheduleRoutine')}
          </button>
        </form>
      )}

      {/* Morning Section */}
      <section className="flex flex-col gap-4">
        <h3 className="font-sans text-sm font-semibold text-primary flex items-center gap-2 border-b border-surface-variant/50 pb-2 uppercase tracking-widest select-none">
          <span className="material-symbols-outlined text-lg">wb_twilight</span>
          {t('routines.morningRhythms')}
        </h3>
        <div className="flex flex-col gap-3">
          {morningRoutines.map(renderRoutineCard)}
          {morningRoutines.length === 0 && (
            <p className="font-sans text-xs text-on-surface-variant/60 italic pl-2">
              {t('routines.noMorningRoutinesRecorded')}
            </p>
          )}
        </div>
      </section>

      {/* Afternoon Section */}
      <section className="flex flex-col gap-4">
        <h3 className="font-sans text-sm font-semibold text-primary flex items-center gap-2 border-b border-surface-variant/50 pb-2 uppercase tracking-widest select-none">
          <span className="material-symbols-outlined text-lg">light_mode</span>
          {t('routines.afternoonRhythms')}
        </h3>
        <div className="flex flex-col gap-3">
          {afternoonRoutines.map(renderRoutineCard)}
          {afternoonRoutines.length === 0 && (
            <p className="font-sans text-xs text-on-surface-variant/60 italic pl-2">
              {t('routines.noAfternoonRoutinesRecorded')}
            </p>
          )}
        </div>
      </section>

      {/* Evening Section */}
      <section className="flex flex-col gap-4">
        <h3 className="font-sans text-sm font-semibold text-primary flex items-center gap-2 border-b border-surface-variant/50 pb-2 uppercase tracking-widest select-none">
          <span className="material-symbols-outlined text-lg">nights_stay</span>
          {t('routines.eveningRhythms')}
        </h3>
        <div className="flex flex-col gap-3">
          {eveningRoutines.map(renderRoutineCard)}
          {eveningRoutines.length === 0 && (
            <p className="font-sans text-xs text-on-surface-variant/60 italic pl-2">
              {t('routines.noEveningRoutinesScheduled')}
            </p>
          )}
        </div>
      </section>

      {/* FLOATING TOAST NOTIFICATION */}
      {alertMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-on-primary px-5 py-3 rounded-xl font-sans text-xs font-bold shadow-lg animate-fade-in flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">notifications_active</span>
          <span>{alertMessage}</span>
        </div>
      )}

      {/* NEW DAY CONFIRMATION / REWARD MODAL */}
      {showNewDayModal && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="w-full max-w-md bg-surface-bright border border-outline-variant/25 rounded-3xl p-6 space-y-4 shadow-xl text-left animate-scale-up">
            <div className="flex items-center gap-3 pb-2 border-b border-outline-variant/15">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span
                  className="material-symbols-outlined text-xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {completedRoutines === totalRoutines ? 'celebration' : 'warning'}
                </span>
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-on-surface">
                  {completedRoutines === totalRoutines
                    ? t('ui.newDayModalTitle')
                    : t('ui.newDayModalResetTitle')}
                </h3>
                <p className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant font-sans">
                  {t('routines.dailyCycleManagement')}
                </p>
              </div>
            </div>

            <div className="space-y-3 font-sans">
              {completedRoutines === totalRoutines ? (
                <p className="text-xs text-on-surface-variant leading-relaxed font-serif italic">
                  {t('ui.newDayModalSuccess')}
                </p>
              ) : (
                <p className="text-xs text-on-surface-variant leading-relaxed font-serif italic">
                  {t('ui.newDayModalWarning')}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-outline-variant/15">
              <button
                type="button"
                onClick={() => setShowNewDayModal(false)}
                className="px-4 py-2 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container transition-all cursor-pointer"
              >
                {t('ui.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const completedAll = completedRoutines === totalRoutines;
                  onStartNewDay(completedAll);
                  setShowNewDayModal(false);

                  // Trigger local notification feedback
                  setAlertMessage(
                    completedAll
                      ? t('routines.congratulationsOnCompletingTodayS')
                      : t('routines.newDayInitializedDailyStreak'),
                  );
                  setTimeout(() => setAlertMessage(null), 4000);
                }}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                  completedRoutines === totalRoutines
                    ? 'bg-primary hover:bg-primary/95 text-on-primary'
                    : 'bg-error hover:bg-error/95 text-on-error'
                }`}
              >
                {completedRoutines === totalRoutines
                  ? t('ui.beginTomorrowsRhythm')
                  : t('ui.resetDayAndStreak')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
