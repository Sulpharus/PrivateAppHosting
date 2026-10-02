import type React from 'react';
import { useState } from 'react';
import { MediaRow } from '../components/MediaRow';
import { Overlay } from '../components/Overlay';
import { showToast } from '../components/Toast';
import { t } from '../i18n';
import type { SharedEntry } from '../services/sharing';
import type { ListCustomItem, MediaItem, MediaList } from '../types';
import { formatDate, getKindLabel, getProgressSummary } from '../utils/text';

interface ListenViewProps {
  lists: MediaList[];
  items: MediaItem[];
  onSelectItem: (item: MediaItem) => void;
  onSaveList: (list: MediaList) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onOpenShareModalForList: (list: MediaList) => void;
  /** What other people shared with me. */
  shared: SharedEntry[];
  onCopySharedWork: (work: MediaItem) => Promise<void>;
}

/** A read-only line for a work someone else shared, with a way to copy it. */
const SharedWorkRow: React.FC<{ work: MediaItem; onCopy: () => void }> = ({ work, onCopy }) => (
  <div className="mn-row mn-row--text">
    <span>
      <span className="mn-row-title">{work.title}</span>
      <span className="mn-row-sub">
        {[getKindLabel(work.kind), work.creator, getProgressSummary(work)]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </span>
    <button type="button" className="mn-btn text-xs" onClick={onCopy}>
      {t('lists.intoCollection')}
    </button>
  </div>
);

export const ListenView: React.FC<ListenViewProps> = ({
  lists,
  items,
  onSelectItem,
  onSaveList,
  onDeleteList,
  onOpenShareModalForList,
  shared,
  onCopySharedWork,
}) => {
  const [activeListId, setActiveListId] = useState<string>(lists[0]?.id || '');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [newListKind, setNewListKind] = useState<MediaList['kind']>('readinglist');

  // New task input
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const activeList = lists.find((l) => l.id === activeListId) || lists[0];
  const linkedMedia = items.filter((item) => activeList?.itemIds.includes(item.id));

  // Toggle custom task done
  const handleToggleTask = async (taskId: string) => {
    if (!activeList) return;
    const customItems = (activeList.customItems || []).map((ci) => {
      if (ci.id === taskId) {
        return { ...ci, done: !ci.done };
      }
      return ci;
    });

    const updated: MediaList = {
      ...activeList,
      customItems,
      updatedAt: new Date().toISOString(),
    };
    await onSaveList(updated);
  };

  // Add a task to current list
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !activeList) return;

    const newTask: ListCustomItem = {
      id: `task_${Date.now()}`,
      title: newTaskTitle.trim(),
      done: false,
      position: (activeList.customItems?.length || 0) + 1,
    };

    const updated: MediaList = {
      ...activeList,
      customItems: [...(activeList.customItems || []), newTask],
      updatedAt: new Date().toISOString(),
    };

    await onSaveList(updated);
    setNewTaskTitle('');
    showToast(t('lists.taskAdded'));
  };

  // Remove a media item from current list
  const handleRemoveMediaFromList = async (itemId: string) => {
    if (!activeList) return;
    const updated: MediaList = {
      ...activeList,
      itemIds: activeList.itemIds.filter((id) => id !== itemId),
      updatedAt: new Date().toISOString(),
    };
    await onSaveList(updated);
    showToast(t('lists.removed'));
  };

  // Create new list
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListTitle.trim()) return;

    const newList: MediaList = {
      id: `list_${Date.now()}`,
      title: newListTitle.trim(),
      description: newListDescription.trim() || undefined,
      kind: newListKind,
      itemIds: [],
      customItems: [],
      ownerId: '',
      updatedAt: new Date().toISOString(),
    };

    await onSaveList(newList);
    setActiveListId(newList.id);
    setShowCreateModal(false);
    setNewListTitle('');
    setNewListDescription('');
    showToast(t('lists.created', { title: newList.title }));
  };

  const openTasks = (activeList?.customItems || []).filter((task) => !task.done);
  const doneTasks = (activeList?.customItems || []).filter((task) => task.done);

  return (
    <div className="grid gap-6">
      {/* List Selector Chips */}
      <div className="flex items-center justify-between gap-3">
        <fieldset className="mn-chips" aria-label={t('lists.choose')}>
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              className="mn-filter"
              aria-pressed={l.id === activeList?.id}
              onClick={() => setActiveListId(l.id)}
            >
              {t('lists.chip', {
                title: l.title,
                n: l.itemIds.length + (l.customItems?.length || 0),
              })}
            </button>
          ))}
        </fieldset>

        <button
          type="button"
          className="mn-btn mn-btn--primary text-xs shrink-0"
          onClick={() => setShowCreateModal(true)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{t('lists.new')}</span>
        </button>
      </div>

      {activeList ? (
        <div className="grid gap-6">
          {/* Active List Info Card */}
          <div className="mn-card">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="text-2xl font-bold tracking-tight mb-1">{activeList.title}</h2>
                {activeList.description && (
                  <p className="text-sm text-[var(--mn-muted)]">{activeList.description}</p>
                )}
                {activeList.sharedWith && activeList.sharedWith.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-xs font-semibold text-[var(--mn-accent-text)] bg-[var(--mn-accent-soft)] px-2 py-0.5 rounded-full">
                      {t('lists.sharedWith', {
                        names: (activeList.sharedWithNames ?? activeList.sharedWith).join(', '),
                      })}
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="mn-btn mn-btn--primary text-sm"
                  onClick={() => onOpenShareModalForList(activeList)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  <span>{t('lists.shareAndPdf')}</span>
                </button>
                <button
                  type="button"
                  className="mn-btn mn-btn--danger text-sm"
                  onClick={() => {
                    if (confirm(t('lists.confirmDelete', { title: activeList.title }))) {
                      onDeleteList(activeList.id);
                    }
                  }}
                  aria-label={t('lists.delete')}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Section: Linked Media */}
          <section>
            <div className="mn-sect">
              <h3>
                {t('lists.linkedMedia')}
                <small>{linkedMedia.length}</small>
              </h3>
            </div>

            {linkedMedia.length > 0 ? (
              <div className="mn-list">
                {linkedMedia.map((item) => (
                  <div key={item.id} className="relative group">
                    <MediaRow item={item} onClick={() => onSelectItem(item)} />
                    <button
                      type="button"
                      className="absolute right-1 top-1 min-h-11 min-w-11 px-2 text-xs text-[var(--mn-muted)] hover:text-[var(--mn-bad)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveMediaFromList(item.id);
                      }}
                      title={t('lists.removeFromList')}
                    >
                      {t('lists.remove')}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mn-empty">
                <p>{t('lists.noMedia')}</p>
              </div>
            )}
          </section>

          {/* Section: Checklist Tasks & Subtasks */}
          <section>
            <div className="mn-sect">
              <h3>
                {t('lists.tasksTitle')}
                <small>{openTasks.length + doneTasks.length}</small>
              </h3>
            </div>

            <div className="mn-card grid gap-4">
              {/* Quick Add Task Input */}
              <form onSubmit={handleAddTask} className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('lists.taskPlaceholder')}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="flex-1"
                />
                <button
                  type="submit"
                  className="mn-btn mn-btn--primary"
                  disabled={!newTaskTitle.trim()}
                >
                  {t('common.add')}
                </button>
              </form>

              {/* Open Tasks */}
              {openTasks.length > 0 && (
                <div className="mn-checks">
                  {openTasks.map((task) => (
                    <label key={task.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => handleToggleTask(task.id)}
                      />
                      <span className="text-sm font-medium">{task.title}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Done Tasks Collapsible */}
              {doneTasks.length > 0 && (
                <details className="mn-more pt-2">
                  <summary>{t('lists.doneTasks', { n: doneTasks.length })}</summary>
                  <div className="mn-checks pl-2">
                    {doneTasks.map((task) => (
                      <label key={task.id} className="flex items-center gap-3 opacity-60">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={() => handleToggleTask(task.id)}
                        />
                        <span className="text-sm font-medium line-through">{task.title}</span>
                      </label>
                    ))}
                  </div>
                </details>
              )}

              {openTasks.length === 0 && doneTasks.length === 0 && (
                <p className="mn-note text-center py-2">{t('lists.noTasks')}</p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="mn-empty">
          <h3>{t('lists.emptyTitle')}</h3>
          <p>{t('lists.emptyText')}</p>
          <button
            type="button"
            className="mn-btn mn-btn--primary"
            onClick={() => setShowCreateModal(true)}
          >
            {t('lists.create')}
          </button>
        </div>
      )}

      {/* Modal: Create List */}
      {showCreateModal && (
        <Overlay onClose={() => setShowCreateModal(false)} labelledBy="new-list-title">
          <div className="mn-sheet-bar">
            <button
              type="button"
              className="mn-btn mn-btn--ghost"
              onClick={() => setShowCreateModal(false)}
            >
              {t('common.cancel')}
            </button>
            <h2 id="new-list-title">{t('lists.newTitle')}</h2>
            <span />
          </div>

          <form onSubmit={handleCreateList} className="mn-sheet-body mn-form">
            <fieldset>
              <label className="mn-field">
                {t('lists.name')}
                <input
                  type="text"
                  required
                  placeholder={t('lists.namePh')}
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                />
              </label>

              <label className="mn-field">
                {t('common.description')}
                <input
                  type="text"
                  placeholder={t('lists.descPh')}
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                />
              </label>

              <label className="mn-field">
                {t('lists.kind')}
                <select
                  value={newListKind}
                  onChange={(e) => setNewListKind(e.target.value as MediaList['kind'])}
                >
                  <option value="readinglist">{t('lists.kindReading')}</option>
                  <option value="watchlist">{t('lists.kindWatch')}</option>
                  <option value="custom">{t('lists.kindCustom')}</option>
                  <option value="checklist">{t('lists.kindChecklist')}</option>
                </select>
              </label>
            </fieldset>

            <button type="submit" className="mn-btn mn-btn--primary w-full mt-4">
              {t('lists.createSubmit')}
            </button>
          </form>
        </Overlay>
      )}
      {shared.length > 0 && (
        <section className="grid gap-3 mt-8" aria-labelledby="shared-title">
          <div className="mn-sect">
            <h2 id="shared-title">
              {t('lists.sharedWithYou')}
              <small>{shared.length}</small>
            </h2>
          </div>
          {shared.map((entry) => (
            <div key={entry.key} className="mn-card">
              <p className="text-xs text-[var(--mn-muted)] mb-2">
                {t('lists.from', { name: entry.from.name, date: formatDate(entry.updatedAt) })}
              </p>
              {entry.work && (
                <SharedWorkRow
                  work={entry.work}
                  onCopy={() => void onCopySharedWork(entry.work as MediaItem)}
                />
              )}
              {entry.list && (
                <>
                  <h3 className="text-lg font-bold">{entry.list.title}</h3>
                  {entry.list.description && (
                    <p className="text-sm text-[var(--mn-muted)]">{entry.list.description}</p>
                  )}
                  <div className="mn-list mt-2">
                    {(entry.items ?? []).map((work) => (
                      <SharedWorkRow
                        key={work.id}
                        work={work}
                        onCopy={() => void onCopySharedWork(work)}
                      />
                    ))}
                    {(entry.list.customItems ?? []).map((task) => (
                      <div key={task.id} className="mn-row mn-row--text">
                        <span className="mn-row-title">
                          {task.done ? '✓ ' : ''}
                          {task.title}
                        </span>
                        <span />
                      </div>
                    ))}
                    {(entry.items ?? []).length === 0 &&
                      (entry.list.customItems ?? []).length === 0 && (
                        <p className="mn-note">{t('lists.empty')}</p>
                      )}
                  </div>
                </>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
