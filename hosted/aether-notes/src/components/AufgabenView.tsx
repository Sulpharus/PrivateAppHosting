/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { KanbanColumn, KanbanTask } from '../types';

interface AufgabenViewProps {
  tasks: KanbanTask[];
  onAddTask: (task: Omit<KanbanTask, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateTask: (task: KanbanTask) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  newTaskTrigger?: number;
}

export default function AufgabenView({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  newTaskTrigger,
}: AufgabenViewProps) {
  // Mode switcher: Kanban vs. Liste
  const [viewMode, setViewMode] = useState<'kanban' | 'liste'>('kanban');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'work' | 'personal'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  // Sheet / Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColumn, setFormColumn] = useState<KanbanColumn>('todo');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formCategory, setFormCategory] = useState<'work' | 'personal'>('work');
  const [formDueDate, setFormDueDate] = useState('');
  const [formTagsStr, setFormTagsStr] = useState('');
  const [formSubtasks, setFormSubtasks] = useState<
    { id: string; text: string; completed: boolean }[]
  >([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');

  // Quick single-field task adder on the list view
  const [quickTaskTitle, setQuickTaskTitle] = useState('');

  // Open editor for new task
  const handleOpenNew = (col: KanbanColumn = 'todo') => {
    setEditingTask(null);
    setFormTitle('');
    setFormDescription('');
    setFormColumn(col);
    setFormPriority('medium');
    setFormCategory('work');
    setFormDueDate('');
    setFormTagsStr('');
    setFormSubtasks([]);
    setNewSubtaskText('');
    setIsEditorOpen(true);
  };

  useEffect(() => {
    if (newTaskTrigger && newTaskTrigger > 0) {
      handleOpenNew();
    }
  }, [newTaskTrigger]);

  const handleOpenEdit = (t: KanbanTask) => {
    setEditingTask(t);
    setFormTitle(t.title);
    setFormDescription(t.description || '');
    setFormColumn(t.column);
    setFormPriority(t.priority);
    setFormCategory(t.category || 'work');
    setFormDueDate(t.dueDate || '');
    setFormTagsStr(t.tags ? t.tags.join(', ') : '');
    setFormSubtasks(t.checklistItems || []);
    setNewSubtaskText('');
    setIsEditorOpen(true);
  };

  const handleAddSubtask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSubtaskText.trim()) return;
    setFormSubtasks([
      ...formSubtasks,
      { id: `st-${Date.now()}`, text: newSubtaskText.trim(), completed: false },
    ]);
    setNewSubtaskText('');
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const tags = formTagsStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (editingTask) {
      const updated: KanbanTask = {
        ...editingTask,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        column: formColumn,
        priority: formPriority,
        category: formCategory,
        dueDate: formDueDate || undefined,
        tags: tags.length > 0 ? tags : undefined,
        checklistItems: formSubtasks.length > 0 ? formSubtasks : undefined,
      };
      await onUpdateTask(updated);
      if (window.mnui?.toast) window.mnui.toast('Aufgabe aktualisiert');
    } else {
      await onAddTask({
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        column: formColumn,
        priority: formPriority,
        category: formCategory,
        dueDate: formDueDate || undefined,
        tags: tags.length > 0 ? tags : undefined,
        checklistItems: formSubtasks.length > 0 ? formSubtasks : undefined,
      });
      if (window.mnui?.toast) window.mnui.toast('Aufgabe angelegt');
    }

    setIsEditorOpen(false);
  };

  // Quick inline add in list view
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    await onAddTask({
      title: quickTaskTitle.trim(),
      column: 'todo',
      priority: 'medium',
      category: 'work',
    });
    setQuickTaskTitle('');
    if (window.mnui?.toast) window.mnui.toast('Aufgabe hinzugefügt');
  };

  // Shift column
  const handleShiftColumn = async (task: KanbanTask, dir: 'left' | 'right') => {
    const cols: KanbanColumn[] = ['todo', 'in_progress', 'review', 'done'];
    const idx = cols.indexOf(task.column);
    const nextIdx = dir === 'right' ? idx + 1 : idx - 1;
    if (nextIdx >= 0 && nextIdx < cols.length) {
      await onUpdateTask({ ...task, column: cols[nextIdx] });
    }
  };

  // Toggle subtask directly on a task
  const handleToggleSubtask = async (task: KanbanTask, subtaskId: string) => {
    const updatedSubtasks = (task.checklistItems || []).map((st) =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st,
    );
    await onUpdateTask({ ...task, checklistItems: updatedSubtasks });
  };

  // Toggle task complete / done
  const handleToggleDone = async (task: KanbanTask) => {
    const isDone = task.column === 'done';
    await onUpdateTask({
      ...task,
      column: isDone ? 'todo' : 'done',
    });
    if (window.mnui?.toast)
      window.mnui.toast(isDone ? 'Aufgabe wieder geöffnet' : 'Aufgabe erledigt');
  };

  // Clear all done tasks
  const handleClearDone = async () => {
    const doneTasks = tasks.filter((t) => t.column === 'done');
    if (doneTasks.length === 0) return;
    if (confirm(`${doneTasks.length} erledigte Aufgaben wirklich löschen?`)) {
      for (const t of doneTasks) {
        await onDeleteTask(t.id);
      }
      if (window.mnui?.toast) window.mnui.toast('Erledigte Aufgaben gelöscht');
    }
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const matchSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q));
      const matchCat = categoryFilter === 'all' || (t.category || 'work') === categoryFilter;
      const matchPri = priorityFilter === 'all' || t.priority === priorityFilter;
      return matchSearch && matchCat && matchPri;
    });
  }, [tasks, search, categoryFilter, priorityFilter]);

  const activeTasks = useMemo(
    () => filteredTasks.filter((t) => t.column !== 'done'),
    [filteredTasks],
  );
  const doneTasks = useMemo(
    () => filteredTasks.filter((t) => t.column === 'done'),
    [filteredTasks],
  );

  const columns: { id: KanbanColumn; title: string; color: string }[] = [
    { id: 'todo', title: 'Zu tun', color: 'var(--mn-muted)' },
    { id: 'in_progress', title: 'In Bearbeitung', color: 'var(--mn-warn)' },
    { id: 'review', title: 'Überprüfung', color: 'var(--mn-accent-text)' },
    { id: 'done', title: 'Erledigt', color: 'var(--mn-ok)' },
  ];

  return (
    <div className="mn-aufgaben-view">
      {/* Search, Filter & Segmented View Controls */}
      <div style={{ display: 'grid', gap: 'var(--mn-s3)', marginBottom: 'var(--mn-s5)' }}>
        <div
          style={{ display: 'flex', gap: 'var(--mn-s3)', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div className="mn-search" style={{ flex: '1 1 220px' }}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Aufgaben durchsuchen..."
              aria-label="Aufgaben durchsuchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Segmented View Switch: Kanban vs. Liste */}
          <div className="mn-seg" role="group" aria-label="Ansicht" style={{ minWidth: '190px' }}>
            <button
              type="button"
              aria-pressed={viewMode === 'kanban'}
              onClick={() => setViewMode('kanban')}
            >
              Kanban-Tafel
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'liste'}
              onClick={() => setViewMode('liste')}
            >
              Aufgabenliste
            </button>
          </div>

          {/* Category filter */}
          <select
            style={{ width: 'auto', minHeight: 'var(--mn-tap)' }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            aria-label="Kategorie"
          >
            <option value="all">Alle Kategorien</option>
            <option value="work">💼 Arbeit</option>
            <option value="personal">🌱 Privat</option>
          </select>

          {/* Priority filter */}
          <select
            style={{ width: 'auto', minHeight: 'var(--mn-tap)' }}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            aria-label="Priorität"
          >
            <option value="all">Alle Prioritäten</option>
            <option value="high">🌋 Hoch</option>
            <option value="medium">⚡ Mittel</option>
            <option value="low">🌱 Niedrig</option>
          </select>
        </div>
      </div>

      {/* VIEW: KANBAN BOARD */}
      {viewMode === 'kanban' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 'var(--mn-s4)',
            alignItems: 'start',
          }}
        >
          {columns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.column === col.id);
            return (
              <div
                key={col.id}
                className="mn-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--mn-s3)',
                  minHeight: '380px',
                }}
              >
                {/* Column Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--mn-line)',
                    paddingBottom: 'var(--mn-s2)',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 'var(--mn-fs-md)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--mn-s2)',
                    }}
                  >
                    <span
                      style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }}
                    />
                    {col.title}
                    <small className="mn-muted">({colTasks.length})</small>
                  </h3>
                  <button
                    className="mn-icon-btn"
                    style={{ width: 32, height: 32 }}
                    type="button"
                    title={`Aufgabe zu ${col.title} hinzufügen`}
                    onClick={() => handleOpenNew(col.id)}
                  >
                    +
                  </button>
                </div>

                {/* Task Cards in Column */}
                <div style={{ display: 'grid', gap: 'var(--mn-s3)' }}>
                  {colTasks.length === 0 ? (
                    <p
                      className="mn-note"
                      style={{ textAlign: 'center', padding: 'var(--mn-s4) 0' }}
                    >
                      Keine Aufgaben
                    </p>
                  ) : (
                    colTasks.map((task) => {
                      const completedCount =
                        task.checklistItems?.filter((c) => c.completed).length || 0;
                      const totalCount = task.checklistItems?.length || 0;

                      return (
                        <div
                          key={task.id}
                          className="mn-card"
                          style={{
                            background: 'var(--mn-bg)',
                            boxShadow: 'none',
                            border: '1px solid var(--mn-line)',
                            padding: 'var(--mn-s3)',
                            display: 'grid',
                            gap: 'var(--mn-s2)',
                          }}
                        >
                          {/* Priority & Category badges */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span
                              className={`mn-chip ${task.priority === 'high' ? 'mn-chip--bad' : task.priority === 'medium' ? 'mn-chip--warn' : 'mn-chip--plain'}`}
                              style={{ fontSize: '10px', padding: '2px 8px' }}
                            >
                              {task.priority === 'high'
                                ? 'Hoch'
                                : task.priority === 'medium'
                                  ? 'Mittel'
                                  : 'Niedrig'}
                            </span>
                            <span
                              className="mn-chip mn-chip--plain"
                              style={{ fontSize: '10px', padding: '2px 8px' }}
                            >
                              {task.category === 'personal' ? 'Privat' : 'Arbeit'}
                            </span>
                          </div>

                          {/* Title & Description */}
                          <div style={{ cursor: 'pointer' }} onClick={() => handleOpenEdit(task)}>
                            <h4
                              style={{
                                margin: '2px 0 0',
                                fontSize: 'var(--mn-fs-sm)',
                                fontWeight: 650,
                              }}
                            >
                              {task.title}
                            </h4>
                            {task.description && (
                              <p
                                className="mn-muted"
                                style={{
                                  margin: '4px 0 0',
                                  fontSize: 'var(--mn-fs-xs)',
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {task.description}
                              </p>
                            )}
                          </div>

                          {/* Sub-Checklist with Progress bar */}
                          {totalCount > 0 && (
                            <div style={{ marginTop: '2px' }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  color: 'var(--mn-muted)',
                                  marginBottom: 2,
                                }}
                              >
                                <span>Meilensteine</span>
                                <span>
                                  {completedCount}/{totalCount}
                                </span>
                              </div>
                              <div className="mn-bar" style={{ padding: 0, border: 0 }}>
                                <span className="mn-meter">
                                  <i
                                    style={{
                                      width: `${Math.round((completedCount / totalCount) * 100)}%`,
                                    }}
                                  />
                                </span>
                              </div>
                              <div style={{ display: 'grid', gap: '3px', marginTop: '4px' }}>
                                {task.checklistItems!.map((st) => (
                                  <label
                                    key={st.id}
                                    style={{
                                      display: 'flex',
                                      gap: '6px',
                                      alignItems: 'center',
                                      fontSize: '11px',
                                      cursor: 'pointer',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      style={{ width: 14, height: 14 }}
                                      checked={st.completed}
                                      onChange={() => handleToggleSubtask(task, st.id)}
                                    />
                                    <span
                                      style={{
                                        textDecoration: st.completed ? 'line-through' : 'none',
                                        color: st.completed ? 'var(--mn-muted)' : 'inherit',
                                      }}
                                    >
                                      {st.text}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Card Footer: Due Date & Shift Controls */}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderTop: '1px solid var(--mn-line)',
                              paddingTop: '6px',
                              marginTop: '4px',
                            }}
                          >
                            <span style={{ fontSize: '11px', color: 'var(--mn-muted)' }}>
                              {task.dueDate ? `📅 ${task.dueDate}` : ''}
                            </span>
                            <div style={{ display: 'flex', gap: '2px' }}>
                              <button
                                className="mn-icon-btn"
                                style={{ width: 28, height: 28, fontSize: '12px' }}
                                type="button"
                                disabled={col.id === 'todo'}
                                title="Nach links verschieben"
                                onClick={() => handleShiftColumn(task, 'left')}
                              >
                                ‹
                              </button>
                              <button
                                className="mn-icon-btn"
                                style={{ width: 28, height: 28, fontSize: '12px' }}
                                type="button"
                                disabled={col.id === 'done'}
                                title="Nach rechts verschieben"
                                onClick={() => handleShiftColumn(task, 'right')}
                              >
                                ›
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VIEW: AUFGABENLISTE */
        <div>
          {/* Quick task input at the top */}
          <form
            onSubmit={handleQuickAdd}
            style={{ display: 'flex', gap: 'var(--mn-s2)', marginBottom: 'var(--mn-s5)' }}
          >
            <input
              placeholder="Neuer Eintrag... (z. B. Steuererklärung prüfen)"
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="mn-btn mn-btn--primary" type="submit">
              Hinzufügen
            </button>
          </form>

          {/* Active Tasks List */}
          <div className="mn-list" style={{ marginBottom: 'var(--mn-s6)' }}>
            {activeTasks.length === 0 ? (
              <p className="mn-note" style={{ textAlign: 'center', padding: 'var(--mn-s4) 0' }}>
                Keine offenen Aufgaben.
              </p>
            ) : (
              activeTasks.map((task) => {
                const completedCount = task.checklistItems?.filter((c) => c.completed).length || 0;
                const totalCount = task.checklistItems?.length || 0;

                return (
                  <div key={task.id} className="mn-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ paddingTop: 2 }}>
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => handleToggleDone(task)}
                        title="Als erledigt markieren"
                      />
                    </div>

                    <div
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      onClick={() => handleOpenEdit(task)}
                    >
                      <span className="mn-row-title">{task.title}</span>
                      <span className="mn-row-sub">
                        {task.category === 'personal' ? '🌱 Privat' : '💼 Arbeit'}
                        {task.description ? ` · ${task.description}` : ''}
                      </span>

                      {totalCount > 0 && (
                        <div
                          style={{
                            marginTop: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--mn-s2)',
                          }}
                        >
                          <span
                            className="mn-chip mn-chip--plain"
                            style={{ fontSize: 'var(--mn-fs-xs)' }}
                          >
                            {completedCount}/{totalCount} Teilaufgaben
                          </span>
                        </div>
                      )}
                    </div>

                    <div
                      className="mn-row-side"
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--mn-s2)' }}
                    >
                      {task.dueDate && (
                        <span
                          className="mn-chip mn-chip--warn"
                          style={{ fontSize: 'var(--mn-fs-xs)' }}
                        >
                          {task.dueDate}
                        </span>
                      )}
                      <span
                        className={`mn-chip ${task.priority === 'high' ? 'mn-chip--bad' : task.priority === 'medium' ? 'mn-chip--warn' : 'mn-chip--plain'}`}
                        style={{ fontSize: 'var(--mn-fs-xs)' }}
                      >
                        {task.priority === 'high'
                          ? 'Hoch'
                          : task.priority === 'medium'
                            ? 'Mittel'
                            : 'Niedrig'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Collapsible Done Section */}
          {doneTasks.length > 0 && (
            <div className="mn-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--mn-s3)',
                }}
              >
                <h3 style={{ margin: 0, fontSize: 'var(--mn-fs-md)' }}>
                  Erledigt ({doneTasks.length})
                </h3>
                <button
                  className="mn-link"
                  style={{ color: 'var(--mn-bad)', fontSize: 'var(--mn-fs-xs)' }}
                  type="button"
                  onClick={handleClearDone}
                >
                  Erledigte löschen
                </button>
              </div>

              <div className="mn-checks">
                {doneTasks.map((task) => (
                  <label
                    key={task.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 'var(--mn-s2)', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={() => handleToggleDone(task)}
                      />
                      <span style={{ textDecoration: 'line-through', color: 'var(--mn-muted)' }}>
                        {task.title}
                      </span>
                    </div>
                    <button
                      className="mn-link"
                      style={{ color: 'var(--mn-bad)', fontSize: 'var(--mn-fs-xs)' }}
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                    >
                      Löschen
                    </button>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* EDITOR SHEET */}
      {isEditorOpen && (
        <div className="mn-overlay" onClick={() => setIsEditorOpen(false)}>
          <div
            className="mn-sheet mn-sheet--tall"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mn-sheet-bar">
              <button
                className="mn-btn mn-btn--ghost"
                type="button"
                onClick={() => setIsEditorOpen(false)}
              >
                Abbrechen
              </button>
              <h2>{editingTask ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h2>
              <span />
            </div>

            <form onSubmit={handleSaveTask} className="mn-sheet-body mn-form">
              <fieldset>
                <legend>Aufgabendetails</legend>
                <label className="mn-field">
                  Titel *
                  <input
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="z. B. Entwurf für Phoenix-Projekt abstimmen"
                  />
                </label>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Kategorie
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as any)}
                    >
                      <option value="work">💼 Arbeit</option>
                      <option value="personal">🌱 Privat</option>
                    </select>
                  </label>
                  <label className="mn-field">
                    Priorität
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as any)}
                    >
                      <option value="high">🌋 Hoch</option>
                      <option value="medium">⚡ Mittel</option>
                      <option value="low">🌱 Niedrig</option>
                    </select>
                  </label>
                </div>

                <div className="mn-grid-2">
                  <label className="mn-field">
                    Status / Spalte
                    <select
                      value={formColumn}
                      onChange={(e) => setFormColumn(e.target.value as any)}
                    >
                      <option value="todo">Zu tun</option>
                      <option value="in_progress">In Bearbeitung</option>
                      <option value="review">Überprüfung</option>
                      <option value="done">Erledigt</option>
                    </select>
                  </label>
                  <label className="mn-field">
                    Fällig am
                    <input
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                    />
                  </label>
                </div>

                <label className="mn-field">
                  Beschreibung
                  <textarea
                    rows={3}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Worum geht es genau? Notizen, Meilensteine..."
                  />
                </label>

                <label className="mn-field">
                  Tags (kommagetrennt)
                  <input
                    value={formTagsStr}
                    onChange={(e) => setFormTagsStr(e.target.value)}
                    placeholder="Kunde, Phoenix, Wichtig"
                  />
                </label>
              </fieldset>

              {/* Sub-tasks checklist */}
              <fieldset>
                <legend>Teilschritte & Meilensteine</legend>
                {formSubtasks.length > 0 && (
                  <div className="mn-checks" style={{ marginBottom: 'var(--mn-s3)' }}>
                    {formSubtasks.map((st, idx) => (
                      <div
                        key={st.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          borderBottom: '1px solid var(--mn-line)',
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            gap: 'var(--mn-s2)',
                            alignItems: 'center',
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={st.completed}
                            onChange={() => {
                              const updated = [...formSubtasks];
                              updated[idx].completed = !updated[idx].completed;
                              setFormSubtasks(updated);
                            }}
                          />
                          <span
                            style={{
                              textDecoration: st.completed ? 'line-through' : 'none',
                              color: st.completed ? 'var(--mn-muted)' : 'inherit',
                            }}
                          >
                            {st.text}
                          </span>
                        </label>
                        <button
                          className="mn-link"
                          style={{ color: 'var(--mn-bad)', fontSize: 'var(--mn-fs-xs)' }}
                          type="button"
                          onClick={() => {
                            setFormSubtasks(formSubtasks.filter((_, i) => i !== idx));
                          }}
                        >
                          Entfernen
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 'var(--mn-s2)' }}>
                  <input
                    placeholder="Teilschritt eintragen..."
                    value={newSubtaskText}
                    onChange={(e) => setNewSubtaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                  />
                  <button className="mn-btn" type="button" onClick={() => handleAddSubtask()}>
                    Hinzufügen
                  </button>
                </div>
              </fieldset>

              <div className="mn-sheet-foot">
                <button
                  className="mn-btn mn-btn--ghost"
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                >
                  Abbrechen
                </button>
                <div className="mn-grow" />
                <button className="mn-btn mn-btn--primary" type="submit">
                  {editingTask ? 'Speichern' : 'Aufgabe erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
