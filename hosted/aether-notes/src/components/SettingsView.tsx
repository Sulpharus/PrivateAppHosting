/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import { exportContactsCsv, exportMiniNodeBackup, MiniNode } from '../mininode';
import { BIRTHDAYS_OFF, scheduleSuiteSync } from '../suite';
import type {
  Contact,
  Interaction,
  JournalEntry,
  KanbanTask,
  Meetup,
  Note,
  Person,
  Routine,
  UserSettings,
} from '../types';

interface SettingsViewProps {
  onResetApp: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  workspaceData: {
    notes: Note[];
    routines: Routine[];
    people: Person[];
    contacts: Contact[];
    interactions: Interaction[];
    meetups: Meetup[];
    kanbanTasks: KanbanTask[];
    journalEntries: JournalEntry[];
    settings: UserSettings;
  };
  onImportBackup: (importedData: any) => Promise<{ count: number; error?: string }>;
}

export default function SettingsView({
  onResetApp,
  isDarkMode,
  onToggleDarkMode,
  workspaceData,
  onImportBackup,
}: SettingsViewProps) {
  const { t } = useTranslation();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Birthdays go to the Kalender (and the Wunschliste) unless this is switched off.
  const [birthdaysOn, setBirthdaysOn] = useState(true);
  useEffect(() => {
    void Promise.resolve(MiniNode.db.getItem(BIRTHDAYS_OFF)).then((off) =>
      setBirthdaysOn(off !== true),
    );
  }, []);
  const toggleBirthdays = async (on: boolean) => {
    setBirthdaysOn(on);
    await MiniNode.db.setItem(BIRTHDAYS_OFF, !on);
    scheduleSuiteSync(500);
  };

  const handleExportBackup = () => {
    exportMiniNodeBackup(workspaceData);
    if (typeof window !== 'undefined' && window.mnui?.toast) {
      window.mnui.toast(t('settings.backupExported'));
    }
  };

  const handleExportCsv = () => {
    exportContactsCsv(workspaceData.contacts);
    if (typeof window !== 'undefined' && window.mnui?.toast) {
      window.mnui.toast(t('settings.contactsExportedAsCsv'));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await onImportBackup(json);
      if (res.error) {
        setImportStatus(res.error);
      } else {
        const msg = t('settings.itemsImportedSuccessfully', { count: res.count });
        setImportStatus(msg);
        if (typeof window !== 'undefined' && window.mnui?.toast) {
          window.mnui.toast(msg);
        }
      }
    } catch (err: any) {
      setImportStatus(t('settings.failedToParseJsonFile'));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setTimeout(() => setImportStatus(null), 4000);
  };

  return (
    <div className="max-w-xl mx-auto w-full pt-4 md:pt-10 pb-16 flex flex-col gap-10 animate-fade-in select-none">
      <div>
        <h2 className="font-sans text-3xl font-bold text-on-surface tracking-tight">
          {t('ui.settingsTitle')}
        </h2>
        <p className="font-serif text-sm text-on-surface-variant mt-1.5 opacity-85">
          {t('ui.settingsSubtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-6 bg-surface-container-low p-6 md:p-8 rounded-2xl border border-outline-variant/30 shadow-sm">
        {/* Workspace Aesthetic Theme Configuration */}
        <div className="space-y-3 pt-4 border-t border-outline-variant/15">
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider font-sans">
            {t('settings.workspaceAestheticTheme')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={() => {
                if (isDarkMode) onToggleDarkMode();
              }}
              className={`p-4 rounded-xl border flex flex-col gap-2 cursor-pointer transition-all text-left select-none ${
                !isDarkMode
                  ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/10 shadow-xs'
                  : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-base ${!isDarkMode ? 'icon-fill text-primary' : ''}`}
                >
                  light_mode
                </span>
                <span className="font-sans text-xs font-bold text-on-surface">
                  {t('settings.classicSunrise')}
                </span>
              </div>
              <span className="font-serif text-[10px] text-on-surface-variant/70 leading-normal">
                {t('settings.softOrganicOffWhiteClay')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isDarkMode) onToggleDarkMode();
              }}
              className={`p-4 rounded-xl border flex flex-col gap-2 cursor-pointer transition-all text-left select-none ${
                isDarkMode
                  ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/10 shadow-xs'
                  : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-base ${isDarkMode ? 'icon-fill text-primary' : ''}`}
                >
                  dark_mode
                </span>
                <span className="font-sans text-xs font-bold text-on-surface">
                  {t('settings.midnightSpruce')}
                </span>
              </div>
              <span className="font-serif text-[10px] text-on-surface-variant/70 leading-normal">
                {t('settings.eyeFriendlyDarkSlateWith')}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-low p-6 md:p-8 rounded-2xl border border-outline-variant/30 flex flex-col gap-3 shadow-sm">
        <h4 className="font-sans text-base font-bold text-on-surface">
          {t('settings.birthdaysTitle')}
        </h4>
        <label className="flex items-center gap-3 min-h-11 cursor-pointer">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={birthdaysOn}
            onChange={(event) => void toggleBirthdays(event.target.checked)}
          />
          <span className="font-sans text-sm text-on-surface">
            {t('settings.birthdaysInCalendar')}
          </span>
        </label>
        <p className="font-serif text-xs text-on-surface-variant leading-relaxed">
          {t('settings.birthdaysHint')}
        </p>
      </div>

      {/* MiniNode Data & Backup Section */}
      <div className="bg-surface-container-low p-6 md:p-8 rounded-2xl border border-outline-variant/30 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            cloud_sync
          </span>
          <h4 className="font-sans text-base font-bold text-on-surface">
            {t('settings.dataBackup')}
          </h4>
        </div>
        <p className="font-serif text-xs text-on-surface-variant leading-relaxed">
          {t('settings.yourDataIsPrivateTo')}
        </p>

        <div className="flex flex-wrap gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleExportBackup}
            className="px-4 py-2.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/25 text-on-surface text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
          >
            <span className="material-symbols-outlined text-sm text-primary">download</span>
            <span>{t('settings.exportBackupJson')}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/25 text-on-surface text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
          >
            <span className="material-symbols-outlined text-sm text-primary">upload</span>
            <span>{t('settings.importBackup')}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-4 py-2.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/25 text-on-surface text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
          >
            <span className="material-symbols-outlined text-sm text-primary">table_view</span>
            <span>{t('settings.exportContactsCsv')}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {importStatus && (
          <div className="p-3 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-sans font-medium animate-fade-in flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">info</span>
            <span>{importStatus}</span>
          </div>
        )}
      </div>

      {/* Danger Zone Section */}
      <div className="p-6 border border-dashed border-error/30 rounded-2xl bg-error/5 flex flex-col gap-4">
        <div>
          <h4 className="font-sans text-sm font-bold text-error">{t('ui.dangerZone')}</h4>
          <p className="font-sans text-xs text-on-surface-variant mt-1 max-w-md">
            {t('ui.resetDescription')}
          </p>
        </div>
        {showResetConfirm ? (
          <div className="flex flex-col gap-3.5 animate-fade-in w-full">
            <span className="text-xs font-bold text-error block">
              {t('settings.completelyEraseEverythingPleaseType')}
            </span>
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder='Gib "löschen" ein'
                className="bg-surface-container-lowest border border-error/30 text-on-surface px-4 py-2.5 rounded-xl text-xs font-sans outline-none focus:outline-error flex-1 select-text"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    confirmText.trim().toLowerCase() !== 'löschen' &&
                    confirmText.trim().toUpperCase() !== 'DELETE'
                  }
                  onClick={() => {
                    onResetApp();
                    setShowResetConfirm(false);
                    setConfirmText('');
                  }}
                  className={`py-2.5 px-4 rounded-xl font-sans text-xs font-extrabold select-none cursor-pointer transition-all active:scale-95 duration-100 flex-1 sm:flex-none text-center ${
                    confirmText.trim().toLowerCase() === 'löschen' ||
                    confirmText.trim().toUpperCase() === 'DELETE'
                      ? 'bg-error hover:bg-error/95 text-on-error shadow-sm'
                      : 'bg-on-surface-variant/10 text-on-surface-variant/40 cursor-not-allowed border border-outline-variant/10'
                  }`}
                >
                  {t('settings.confirmDelete')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetConfirm(false);
                    setConfirmText('');
                  }}
                  className="bg-surface-bright hover:bg-surface-container-high border border-outline-variant/35 py-2.5 px-4 rounded-xl font-sans text-xs font-semibold select-none cursor-pointer text-on-surface flex-1 sm:flex-none text-center"
                >
                  {t('ui.cancel')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowResetConfirm(true);
              setConfirmText('');
            }}
            className="self-start text-error hover:text-on-error hover:bg-error border border-error bg-transparent hover:border-transparent py-2.5 px-4 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 duration-100"
          >
            {t('ui.resetButton')}
          </button>
        )}
      </div>
    </div>
  );
}
