/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import { MiniNode, type MiniNodeUser } from '../mininode';
import type { UserSettings } from '../types';

interface SidebarProps {
  activeTab: 'dashboard' | 'library' | 'routines' | 'people' | 'contacts' | 'settings' | 'kanban';
  setActiveTab: (
    tab: 'dashboard' | 'library' | 'routines' | 'people' | 'contacts' | 'settings' | 'kanban',
  ) => void;
  settings: UserSettings;
  onNewNoteClick: () => void;
  streakCount: number;
  currentUser: MiniNodeUser | null;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  settings,
  onNewNoteClick,
  streakCount,
  currentUser,
  onLogout,
  isDarkMode,
  onToggleDarkMode,
}: SidebarProps) {
  const { t } = useTranslation();
  const [portalUrl, setPortalUrl] = useState('/');
  useEffect(() => {
    MiniNode.portalUrl()
      .then(setPortalUrl)
      .catch(() => {});
  }, []);
  const allApps = t('sidebar.allApps');

  return (
    <>
      {/* Desktop Side Navigation (hidden md:flex) */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 border-r border-outline-variant/30 flex-col p-4 bg-surface-container-low z-40">
        <a
          href={portalUrl}
          className="mx-2 mt-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg px-2 text-xs font-semibold text-on-surface-variant hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            arrow_back
          </span>
          {allApps}
        </a>

        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 py-6 mb-4 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="min-w-0 flex-1">
              <h1 className="font-sans text-base text-primary font-bold leading-none tracking-tight truncate">
                {t('sidebar.aetherNotes')}
              </h1>
              <p className="font-sans text-[10px] text-on-surface-variant mt-1 font-medium select-none truncate">
                {t('sidebar.mindfulContactsNotes')}
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Streak Indicator */}
        <div className="mx-2 mb-6 px-4 py-3 bg-primary/5 rounded-xl border border-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary text-lg"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              local_fire_department
            </span>
            <span className="text-xs text-on-surface-variant font-medium">
              {t('ui.dailyStreak')}
            </span>
          </div>
          <span className="text-sm font-bold text-primary">
            {t('streak.days', { n: streakCount })}
          </span>
        </div>

        {/* Primary CTA */}
        <button
          onClick={onNewNoteClick}
          className="mx-2 mb-6 bg-primary text-on-primary hover:bg-primary/95 font-sans font-medium text-sm py-3 px-4 rounded-xl transition-all hover:scale-[1.02] duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer select-none"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          {t('ui.newNote')}
        </button>

        {/* Navigation Links */}
        <nav className="flex-1 flex flex-col gap-1.5 px-2">
          {/* Dashboard */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 font-sans rounded-xl transition-all duration-200 text-left cursor-pointer group select-none ${
              activeTab === 'dashboard'
                ? 'text-primary font-bold bg-primary-container/20 scale-[0.98]'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl transition-transform duration-200 group-hover:scale-105 ${
                activeTab === 'dashboard' ? 'icon-fill text-primary' : ''
              }`}
            >
              dashboard
            </span>
            <span className="text-sm font-medium">{t('ui.dashboard')}</span>
          </button>

          {/* Notes Library */}
          <button
            onClick={() => setActiveTab('library')}
            className={`w-full flex items-center gap-3 px-4 py-3 font-sans rounded-xl transition-all duration-200 text-left cursor-pointer group select-none ${
              activeTab === 'library'
                ? 'text-primary font-bold bg-primary-container/20 scale-[0.98]'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl transition-transform duration-200 group-hover:scale-105 ${
                activeTab === 'library' ? 'icon-fill text-primary' : ''
              }`}
            >
              description
            </span>
            <span className="text-sm font-medium">{t('ui.notesLibrary')}</span>
          </button>

          {/* Routines */}
          <button
            onClick={() => setActiveTab('routines')}
            className={`w-full flex items-center gap-3 px-4 py-3 font-sans rounded-xl transition-all duration-200 text-left cursor-pointer group select-none ${
              activeTab === 'routines'
                ? 'text-primary font-bold bg-primary-container/20 scale-[0.98]'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl transition-transform duration-200 group-hover:scale-105 ${
                activeTab === 'routines' ? 'icon-fill text-primary' : ''
              }`}
            >
              rebase_edit
            </span>
            <span className="text-sm font-medium">{t('ui.routines')}</span>
          </button>

          {/* People */}
          <button
            onClick={() => setActiveTab('people')}
            className={`w-full flex items-center gap-3 px-4 py-3 font-sans rounded-xl transition-all duration-200 text-left cursor-pointer group select-none ${
              activeTab === 'people'
                ? 'text-primary font-bold bg-primary-container/20 scale-[0.98]'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl transition-transform duration-200 group-hover:scale-105 ${
                activeTab === 'people' ? 'icon-fill text-primary' : ''
              }`}
            >
              group
            </span>
            <span className="text-sm font-medium">{t('ui.people')}</span>
          </button>

          {/* Contacts CRM */}
          <button
            onClick={() => setActiveTab('contacts')}
            className={`w-full flex items-center gap-3 px-4 py-3 font-sans rounded-xl transition-all duration-200 text-left cursor-pointer group select-none ${
              activeTab === 'contacts'
                ? 'text-primary font-bold bg-primary-container/20 scale-[0.98]'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl transition-transform duration-200 group-hover:scale-105 ${
                activeTab === 'contacts' ? 'icon-fill text-primary' : ''
              }`}
            >
              contact_page
            </span>
            <span className="text-sm font-medium">{t('ui.contactsCrm')}</span>
          </button>

          {/* Combined Tasks Board */}
          <button
            onClick={() => setActiveTab('kanban')}
            className={`w-full flex items-center gap-3 px-4 py-3 font-sans rounded-xl transition-all duration-200 text-left cursor-pointer group select-none ${
              activeTab === 'kanban'
                ? 'text-primary font-bold bg-primary-container/20 scale-[0.98]'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl transition-transform duration-200 group-hover:scale-105 ${
                activeTab === 'kanban' ? 'icon-fill text-primary' : ''
              }`}
            >
              view_kanban
            </span>
            <span className="text-sm font-medium">{t('ui.workTasks')}</span>
          </button>
        </nav>

        {/* Footer Navigation */}
        <div className="mt-auto flex flex-col gap-1 px-2 pt-4 border-t border-outline-variant/20">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 font-sans rounded-xl transition-all duration-200 text-left cursor-pointer group select-none ${
              activeTab === 'settings'
                ? 'text-primary font-bold bg-primary-container/20 scale-[0.98]'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl transition-transform duration-200 group-hover:scale-105 ${
                activeTab === 'settings' ? 'icon-fill' : ''
              }`}
            >
              settings
            </span>
            <span className="text-sm font-medium">{t('ui.settingsTitle')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top App Bar (md:hidden) */}
      <header className="flex md:hidden justify-between items-center w-full px-5 py-3 bg-surface border-b border-surface-container-high fixed top-0 left-0 z-40 h-14">
        <div className="flex items-center gap-1.5 min-w-0">
          <a
            href={portalUrl}
            aria-label={allApps}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              arrow_back
            </span>
          </a>
          <span
            className="material-symbols-outlined text-primary text-xl shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            stylus_note
          </span>
          <span className="font-sans font-bold text-xs text-primary tracking-tight truncate">
            {settings.userName}
          </span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/5 rounded-full border border-primary/10 leading-none">
            <span
              className="material-symbols-outlined text-primary text-xs"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              local_fire_department
            </span>
            <span className="text-[10px] font-bold text-primary">{streakCount}d</span>
          </div>
          <button
            onClick={() => setActiveTab('settings')}
            aria-label={t('sidebar.settings')}
            className="w-11 h-11 -mr-1.5 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface shrink-0"
          >
            <span className="material-symbols-outlined text-xl">settings</span>
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation (md:hidden) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-surface-container-high flex justify-around items-center z-45 px-2 pb-safe shadow-lg">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center w-full h-full text-center transition-all ${
            activeTab === 'dashboard' ? 'text-primary' : 'text-on-surface-variant opacity-80'
          }`}
        >
          <span
            className={`material-symbols-outlined text-xl ${activeTab === 'dashboard' ? 'icon-fill' : ''}`}
          >
            dashboard
          </span>
          <span className="font-sans text-[10px] font-medium mt-0.5">{t('ui.dashboardTab')}</span>
        </button>

        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center justify-center w-full h-full text-center transition-all ${
            activeTab === 'library' ? 'text-primary' : 'text-on-surface-variant opacity-80'
          }`}
        >
          <span
            className={`material-symbols-outlined text-xl ${activeTab === 'library' ? 'icon-fill' : ''}`}
          >
            description
          </span>
          <span className="font-sans text-[10px] font-medium mt-0.5">{t('sidebar.notes')}</span>
        </button>

        <div className="w-full flex justify-center -mt-6">
          <button
            onClick={onNewNoteClick}
            className="bg-primary hover:bg-primary/95 text-on-primary w-12 h-12 rounded-full flex items-center justify-center sunlight-shadow transition-transform active:scale-95 duration-200 shrink-0"
          >
            <span className="material-symbols-outlined text-2xl">add</span>
          </button>
        </div>

        <button
          onClick={() => setActiveTab('routines')}
          className={`flex flex-col items-center justify-center w-full h-full text-center transition-all ${
            activeTab === 'routines' ? 'text-primary' : 'text-on-surface-variant opacity-80'
          }`}
        >
          <span
            className={`material-symbols-outlined text-xl ${activeTab === 'routines' ? 'icon-fill' : ''}`}
          >
            rebase_edit
          </span>
          <span className="font-sans text-[10px] font-medium mt-0.5">{t('sidebar.routines')}</span>
        </button>

        <button
          onClick={() => setActiveTab('people')}
          className={`flex flex-col items-center justify-center w-full h-full text-center transition-all ${
            activeTab === 'people' ? 'text-primary' : 'text-on-surface-variant opacity-80'
          }`}
        >
          <span
            className={`material-symbols-outlined text-xl ${activeTab === 'people' ? 'icon-fill' : ''}`}
          >
            group
          </span>
          <span className="font-sans text-[10px] font-medium mt-0.5">{t('ui.people')}</span>
        </button>

        <button
          onClick={() => setActiveTab('kanban')}
          className={`flex flex-col items-center justify-center w-full h-full text-center transition-all ${
            activeTab === 'kanban' ? 'text-primary' : 'text-on-surface-variant opacity-80'
          }`}
        >
          <span
            className={`material-symbols-outlined text-xl ${activeTab === 'kanban' ? 'icon-fill' : ''}`}
          >
            view_kanban
          </span>
          <span className="font-sans text-[10px] font-medium mt-0.5">{t('sidebar.tasks')}</span>
        </button>
      </nav>
    </>
  );
}
