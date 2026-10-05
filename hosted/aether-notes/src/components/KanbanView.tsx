/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Briefcase,
  Calendar,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Edit2,
  FolderDot,
  Heart,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import type { KanbanColumn, KanbanTask } from '../types';

interface KanbanViewProps {
  tasks: KanbanTask[];
  onAddTask: (task: Omit<KanbanTask, 'id' | 'createdAt'>) => void;
  onUpdateTask: (task: KanbanTask) => void;
  onDeleteTask: (id: string) => void;
}

export default function KanbanView({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}: KanbanViewProps) {
  const { t, language } = useTranslation();

  // Filters & Searching
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'work' | 'personal'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Modal Control for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColumn, setFormColumn] = useState<KanbanColumn>('todo');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formCategory, setFormCategory] = useState<'work' | 'personal'>('work');
  const [formDueDate, setFormDueDate] = useState('');
  const [formTagsString, setFormTagsString] = useState('');

  // New Checklist Sub-Checklist state
  const [formChecklist, setFormChecklist] = useState<
    { id: string; text: string; completed: boolean }[]
  >([]);
  const [newSubTaskText, setNewSubTaskText] = useState('');

  // Toast / Status Message
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(null), 3500);
  };

  // Memoized unique tags
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    tasks.forEach((t) => t.tags?.forEach((tag) => tagsSet.add(tag)));
    return Array.from(tagsSet);
  }, [tasks]);

  // Open modal for new task
  const handleOpenAdd = (column: KanbanColumn = 'todo') => {
    setEditingTask(null);
    setFormTitle('');
    setFormDescription('');
    setFormColumn(column);
    setFormPriority('medium');
    setFormCategory('work');
    setFormDueDate('');
    setFormTagsString('');
    setFormChecklist([]);
    setNewSubTaskText('');
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (task: KanbanTask) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || '');
    setFormColumn(task.column);
    setFormPriority(task.priority);
    setFormCategory(task.category || 'work');
    setFormDueDate(task.dueDate || '');
    setFormTagsString(task.tags ? task.tags.join(', ') : '');
    setFormChecklist(task.checklistItems || []);
    setNewSubTaskText('');
    setIsModalOpen(true);
  };

  // Submit new or edited task
  const handleSubmitTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const parsedTags = formTagsString
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    if (editingTask) {
      // Update
      const updated: KanbanTask = {
        ...editingTask,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        column: formColumn,
        priority: formPriority,
        category: formCategory,
        dueDate: formDueDate || undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        checklistItems: formChecklist.length > 0 ? formChecklist : undefined,
      };
      onUpdateTask(updated);
      triggerToast(
        language === 'de' ? 'Aufgabe erfolgreich aktualisiert!' : 'Task updated successfully!',
      );
    } else {
      // Add
      onAddTask({
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        column: formColumn,
        priority: formPriority,
        category: formCategory,
        dueDate: formDueDate || undefined,
        tags: parsedTags.length > 0 ? parsedTags : undefined,
        checklistItems: formChecklist.length > 0 ? formChecklist : undefined,
      });
      triggerToast(language === 'de' ? 'Aufgabe zur Tafel hinzugefügt!' : 'Task added to board!');
    }

    setIsModalOpen(false);
  };

  const handleFormChecklistAdd = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!newSubTaskText.trim()) return;
    const newItem = {
      id: `cli-${Date.now()}`,
      text: newSubTaskText.trim(),
      completed: false,
    };
    setFormChecklist([...formChecklist, newItem]);
    setNewSubTaskText('');
  };

  const handleFormChecklistToggle = (itemId: string) => {
    setFormChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item)),
    );
  };

  const handleFormChecklistDelete = (itemId: string) => {
    setFormChecklist((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleFormChecklistKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleFormChecklistAdd();
    }
  };

  // Toggle sub-checklist item directly from the task card
  const handleToggleSubChecklistItem = (task: KanbanTask, itemId: string) => {
    const updatedItems = (task.checklistItems || []).map((item) =>
      item.id === itemId ? { ...item, completed: !item.completed } : item,
    );
    const updated: KanbanTask = {
      ...task,
      checklistItems: updatedItems,
    };
    onUpdateTask(updated);
  };

  // Quick move to adjacent column
  const handleMoveColumn = (task: KanbanTask, direction: 'left' | 'right') => {
    const order: KanbanColumn[] = ['todo', 'in_progress', 'review', 'done'];
    const curIndex = order.indexOf(task.column);
    const nextIndex = curIndex + (direction === 'right' ? 1 : -1);

    if (nextIndex >= 0 && nextIndex < order.length) {
      const updated: KanbanTask = {
        ...task,
        column: order[nextIndex],
      };
      onUpdateTask(updated);
      const colName =
        order[nextIndex] === 'todo'
          ? t('todo', 'To Do')
          : order[nextIndex] === 'in_progress'
            ? t('inProgress', 'In Progress')
            : order[nextIndex] === 'review'
              ? language === 'de'
                ? 'Überprüfung'
                : 'Review'
              : t('completed', 'Completed');
      triggerToast(
        language === 'de' ? `Aufgabe verschoben nach "${colName}"` : `Task shifted to "${colName}"`,
      );
    }
  };

  // Filtered list of tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // search filter
      const matchesSearch =
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()));

      // priority filter
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;

      // category filter
      const matchesCategory =
        categoryFilter === 'all' || (task.category || 'work') === categoryFilter;

      // tag filter
      const matchesTag = !selectedTag || (task.tags && task.tags.includes(selectedTag));

      return matchesSearch && matchesPriority && matchesCategory && matchesTag;
    });
  }, [tasks, searchTerm, priorityFilter, categoryFilter, selectedTag]);

  // Grouped tasks by column
  const cols: { id: KanbanColumn; name: string; color: string; border: string; bg: string }[] = [
    {
      id: 'todo',
      name: t('todo', 'To Do'),
      color: 'text-neutral-500',
      border: 'border-l-neutral-400',
      bg: 'bg-neutral-500/5',
    },
    {
      id: 'in_progress',
      name: t('inProgress', 'In Progress'),
      color: 'text-amber-600',
      border: 'border-l-amber-500',
      bg: 'bg-amber-500/5',
    },
    {
      id: 'review',
      name: language === 'de' ? 'Überprüfung' : 'Review',
      color: 'text-indigo-600',
      border: 'border-l-indigo-500',
      bg: 'bg-indigo-500/5',
    },
    {
      id: 'done',
      name: t('completed', 'Completed'),
      color: 'text-emerald-600',
      border: 'border-l-emerald-500',
      bg: 'bg-emerald-500/5',
    },
  ];

  const getPriorityStyle = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high':
        return 'bg-error/10 text-error border-error/25';
      case 'medium':
        return 'bg-amber-500/10 text-amber-700 border-amber-500/25';
      case 'low':
        return 'bg-neutral-500/10 text-neutral-600 border-neutral-500/25';
    }
  };

  return (
    <div
      id="combined-tasks-board-root"
      className="max-w-7xl mx-auto w-full pt-4 md:pt-10 pb-16 flex flex-col gap-6 animate-fade-in select-none"
    >
      {/* Toast Alert Header */}
      {alertMsg && (
        <div className="fixed top-6 right-6 bg-primary text-on-primary text-xs font-semibold px-5 py-3 rounded-xl shadow-lg border border-primary/20 z-60 animate-fade-in flex items-center gap-2">
          <Check className="w-4 h-4" />
          {alertMsg}
        </div>
      )}

      {/* Main Title Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans text-3xl font-bold text-on-surface tracking-tight">
            {t('tasksTitle', 'Tasks & Priorities')}
          </h2>
          <p className="font-serif text-sm text-on-surface-variant mt-1.5 opacity-85">
            {t(
              'tasksSubtitle',
              'Manage your personal and work priorities seamlessly in one place.',
            )}
          </p>
        </div>
        <button
          onClick={() => handleOpenAdd('todo')}
          className="bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center gap-1.5 shadow-sm transition-all duration-200 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t('addTask', 'Add Task')}
        </button>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/30 flex flex-col md:flex-row gap-4 items-center justify-between shadow-xs">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-2.5 text-on-surface-variant/40 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={language === 'de' ? 'Aufgaben durchsuchen...' : 'Search tasks...'}
            className="w-full bg-surface-bright border border-outline-variant/20 px-10 py-2 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/40 select-text text-on-surface font-medium"
          />
        </div>

        {/* Categories, Priority & Tag Filters Row */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          {/* Category Quick Pills */}
          <div className="flex bg-surface-bright border border-outline-variant/15 p-1 rounded-xl items-center text-[10px] font-bold">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1 rounded-lg transition-all ${
                categoryFilter === 'all'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {t('allTasks', 'All Tasks')}
            </button>
            <button
              onClick={() => setCategoryFilter('work')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 ${
                categoryFilter === 'work'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Briefcase className="w-3 h-3" />
              {t('workCategory', 'Work')}
            </button>
            <button
              onClick={() => setCategoryFilter('personal')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 ${
                categoryFilter === 'personal'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Heart className="w-3 h-3" />
              {t('personalCategory', 'Personal')}
            </button>
          </div>

          {/* Priority dropdown wrapper */}
          <div className="flex items-center gap-1.5 bg-surface-bright border border-outline-variant/15 px-3 py-1.5 rounded-xl">
            <span className="text-[10px] font-semibold text-on-surface-variant select-none">
              {language === 'de' ? 'Priorität:' : 'Priority:'}
            </span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="bg-transparent border-none text-[10px] text-on-surface font-bold focus:outline-none focus:ring-0 p-0 m-0 cursor-pointer"
            >
              <option value="all">{language === 'de' ? 'Alle Stufen' : 'All Levels'}</option>
              <option value="high">🌋 {t('high', 'High')}</option>
              <option value="medium">⚡ {t('medium', 'Medium')}</option>
              <option value="low">🌱 {t('low', 'Low')}</option>
            </select>
          </div>

          {/* Core Tags collection scroll list */}
          <div className="flex items-center gap-2">
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="bg-primary/10 hover:bg-primary/15 text-primary text-[10px] font-bold px-2.5 py-1.5 rounded-full border border-primary/20 transition-all flex items-center gap-1 cursor-pointer"
              >
                Reset Filter <X className="w-3 h-3" />
              </button>
            )}

            <div className="flex items-center gap-1 overflow-x-auto max-w-[180px] py-1 select-none">
              {allTags.map((tag) => {
                const isActive = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(isActive ? null : tag)}
                    className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary text-on-primary font-bold shadow-xs'
                        : 'bg-surface-bright hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/20'
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Core Kanban columns grid */}
      <div
        id="kanban-columns-container"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 min-h-[500px]"
      >
        {cols.map((column) => {
          const colTasks = filteredTasks.filter((t) => t.column === column.id);

          return (
            <div
              key={column.id}
              className={`flex flex-col bg-surface-container-lowest/80 rounded-2xl border border-outline-variant/20 p-4 shadow-2xs ${column.bg}`}
            >
              {/* Column Title Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-outline-variant/15 font-sans mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full bg-current ${column.color}`} />
                  <span className="font-sans font-bold text-xs text-on-surface tracking-wider uppercase">
                    {column.name}
                  </span>
                  <span className="bg-surface-container-scroll/50 border border-outline-variant/20 text-on-surface-variant font-black text-[9px] px-1.5 py-0.5 rounded-md leading-none">
                    {colTasks.length}
                  </span>
                </div>

                <button
                  onClick={() => handleOpenAdd(column.id)}
                  className="p-1 hover:bg-surface-container text-on-surface-variant/70 hover:text-primary transition-all rounded-lg cursor-pointer"
                  title={`Add to ${column.name}`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Tasks list within column */}
              <div className="flex-1 flex flex-col gap-3.5 overflow-y-auto max-h-[1000px] min-h-[400px]">
                {colTasks.length > 0 ? (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="group bg-surface-bright p-4 rounded-xl border border-outline-variant/20 shadow-2xs hover:shadow-xs transition-all duration-200 relative flex flex-col justify-between hover:border-primary/20 min-h-[140px]"
                    >
                      {/* Interactive edit task trigger */}
                      <button
                        onClick={() => handleOpenEdit(task)}
                        className="absolute top-3 right-8 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-primary/10 text-on-surface-variant/60 hover:text-primary rounded-lg transition-all cursor-pointer flex items-center justify-center z-10"
                        title={language === 'de' ? 'Details bearbeiten' : 'Edit Task Details'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Deletion confirmations */}
                      {pendingDeleteId === task.id ? (
                        <div className="absolute inset-0 bg-surface-bright rounded-xl p-3 flex flex-col justify-center items-center text-center z-20 animate-fade-in border border-error/20">
                          <p className="text-[10px] font-sans font-bold text-error uppercase tracking-widest mb-2">
                            {language === 'de' ? 'Karte löschen?' : 'Erase Task Card?'}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                onDeleteTask(task.id);
                                setPendingDeleteId(null);
                                triggerToast(
                                  language === 'de' ? 'Aufgabe gelöscht' : 'Task deleted',
                                );
                              }}
                              className="bg-error hover:bg-error/95 text-on-error py-1 px-2.5 rounded-lg text-[10px] font-bold cursor-pointer"
                            >
                              {language === 'de' ? 'Ja, löschen' : 'Yes, Delete'}
                            </button>
                            <button
                              onClick={() => setPendingDeleteId(null)}
                              className="bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface py-1 px-2.5 rounded-lg text-[10px] font-semibold cursor-pointer"
                            >
                              {t('cancel', 'Cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPendingDeleteId(task.id)}
                          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-error/10 text-on-surface-variant/60 hover:text-error rounded-lg transition-all cursor-pointer flex items-center justify-center"
                          title="Erase Card"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Content block */}
                      <div>
                        {/* Priority Badge & Category Badge Row */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2.5 overflow-hidden select-none">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-wider ${getPriorityStyle(task.priority)}`}
                          >
                            {t(task.priority, task.priority)}
                          </span>

                          {/* Category Badge */}
                          <span
                            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-wider ${
                              task.category === 'personal'
                                ? 'bg-amber-500/10 text-amber-800 border-amber-500/15'
                                : 'bg-primary/10 text-primary border-primary/15'
                            }`}
                          >
                            {task.category === 'personal' ? (
                              <Heart className="w-2 h-2" />
                            ) : (
                              <Briefcase className="w-2 h-2" />
                            )}
                            <span>
                              {task.category === 'personal'
                                ? t('personalCategory', 'Personal')
                                : t('workCategory', 'Work')}
                            </span>
                          </span>
                        </div>

                        {/* Task Title */}
                        <h4 className="font-sans font-bold text-xs.5 text-on-surface leading-snug tracking-tight">
                          {task.title}
                        </h4>

                        {/* Description */}
                        {task.description && (
                          <p className="font-sans text-[11px] text-on-surface-variant/80 tracking-normal leading-relaxed mt-1.5 line-clamp-3 select-text">
                            {task.description}
                          </p>
                        )}

                        {/* Sub-Checklist progress & list */}
                        {task.checklistItems &&
                          task.checklistItems.length > 0 &&
                          (() => {
                            const totalCount = task.checklistItems.length;
                            const completedCount = task.checklistItems.filter(
                              (item) => item.completed,
                            ).length;
                            const progressPercent = Math.round((completedCount / totalCount) * 100);
                            return (
                              <div className="mt-4 space-y-2 border-t border-outline-variant/10 pt-3">
                                {/* progress */}
                                <div className="flex items-center justify-between text-[9px] text-on-surface-variant/70 font-black tracking-wider uppercase leading-none">
                                  <span>{language === 'de' ? 'Meilensteine' : 'Milestones'}</span>
                                  <span>
                                    {completedCount}/{totalCount} ({progressPercent}%)
                                  </span>
                                </div>
                                <div className="w-full h-1 bg-surface-container rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all duration-300"
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>

                                {/* clickable sub-list */}
                                <ul className="space-y-1.5 pt-1.5 max-h-[110px] overflow-y-auto pr-0.5 scrollbar-thin">
                                  {task.checklistItems.map((item) => (
                                    <li
                                      key={item.id}
                                      className="flex items-start gap-2 select-none text-[10px]"
                                    >
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleSubChecklistItem(task, item.id);
                                        }}
                                        className="text-primary hover:text-primary active:scale-90 transition-transform shrink-0 flex items-center mt-0.5"
                                        title={item.completed ? 'Mark incomplete' : 'Mark complete'}
                                      >
                                        <span className="material-symbols-outlined text-[14px]">
                                          {item.completed
                                            ? 'check_circle'
                                            : 'radio_button_unchecked'}
                                        </span>
                                      </button>
                                      <span
                                        className={`font-sans leading-normal truncate ${
                                          item.completed
                                            ? 'text-on-surface-variant/40 line-through'
                                            : 'text-on-surface font-medium'
                                        }`}
                                        title={item.text}
                                      >
                                        {item.text}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })()}
                      </div>

                      {/* Footer values (tags & dueDate & column controller buttons) */}
                      <div className="mt-4 border-t border-outline-variant/10 pt-3 flex flex-col gap-2.5 font-sans">
                        {/* Due Date & tags */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5 select-none shrink-0">
                          {/* Tags lists */}
                          <div className="flex flex-wrap gap-1 items-center">
                            {task.tags &&
                              task.tags.slice(0, 3).map((tg) => (
                                <span
                                  key={tg}
                                  className="text-[9px] font-serif text-primary/75 italic"
                                >
                                  #{tg}
                                </span>
                              ))}
                          </div>

                          {/* Date display formatted */}
                          {task.dueDate && (
                            <div className="flex items-center gap-1.5 text-on-surface-variant/60">
                              <Calendar className="w-3 h-3 text-outline opacity-70" />
                              <span className="text-[9px] font-black tracking-normal uppercase">
                                {new Date(task.dueDate).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Adjacent state transfer buttons */}
                        <div className="flex items-center justify-between gap-1.5">
                          {/* Left toggle arrow */}
                          <button
                            disabled={column.id === 'todo'}
                            onClick={() => handleMoveColumn(task, 'left')}
                            className="bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 p-1 rounded-lg text-on-surface-variant/85 disabled:opacity-30 disabled:hover:bg-surface-container transition-all cursor-pointer flex items-center justify-center select-none shrink-0"
                            title="Shift Left"
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </button>

                          <span className="text-[8px] tracking-widest font-black uppercase text-on-surface-variant/45">
                            {language === 'de' ? 'Status' : 'Status Shift'}
                          </span>

                          {/* Right toggle arrow */}
                          <button
                            disabled={column.id === 'done'}
                            onClick={() => handleMoveColumn(task, 'right')}
                            className="bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 p-1 rounded-lg text-on-surface-variant/85 disabled:opacity-30 disabled:hover:bg-surface-container transition-all cursor-pointer flex items-center justify-center select-none shrink-0"
                            title="Shift Right"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center bg-surface-container-low/30 border border-dashed border-outline-variant/20 rounded-xl text-[11px] italic text-on-surface-variant/50 flex flex-col items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5 text-outline opacity-30 mt-1" />
                    {language === 'de' ? 'Spalte leer' : 'Column Empty'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Modal Sheet for Creation / Editing (Fluid Overlay Dialog) */}
      {isModalOpen && (
        <div
          id="kanban-task-modal-overlay"
          className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-bright max-w-md w-full rounded-2xl flex flex-col shadow-xl border border-outline-variant/30 overflow-hidden animate-fade-in max-h-[90vh]"
          >
            {/* Header */}
            <header className="px-5 py-4 bg-surface-container-low border-b border-outline-variant/15 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest leading-none">
                <FolderDot className="w-4 h-4" />
                <span>
                  {editingTask
                    ? language === 'de'
                      ? 'Aufgabe bearbeiten'
                      : 'Edit Task Card'
                    : language === 'de'
                      ? 'Neue Aufgabe erstellen'
                      : 'Record New Task Card'}
                </span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-full hover:bg-surface-container transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Inputs Core Form */}
            <form
              onSubmit={handleSubmitTask}
              className="p-5 flex-1 overflow-y-auto flex flex-col gap-4 font-sans text-xs min-h-0"
            >
              {/* Task Title */}
              <div>
                <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                  {t('taskTitle', 'Task Title *')}
                </label>
                <input
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={
                    language === 'de'
                      ? 'z.B., Projektentwurf abschließen'
                      : 'e.g., Complete architectural sketch specs'
                  }
                  className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 select-text text-on-surface font-medium"
                />
              </div>

              {/* Category selector */}
              <div>
                <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1.5 font-sans text-[10px]">
                  {t('categoryLabel', 'Category *')}
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormCategory('work')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all cursor-pointer ${
                      formCategory === 'work'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    <Briefcase className="w-4 h-4" />
                    <span>{t('workCategory', 'Work')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormCategory('personal')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold transition-all cursor-pointer ${
                      formCategory === 'personal'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    <Heart className="w-4 h-4" />
                    <span>{t('personalCategory', 'Personal')}</span>
                  </button>
                </div>
              </div>

              {/* Status & Priority Row */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                    {t('statusLabel', 'Status *')}
                  </label>
                  <select
                    value={formColumn}
                    onChange={(e) => setFormColumn(e.target.value as KanbanColumn)}
                    className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary text-on-surface font-medium"
                  >
                    <option value="todo">{t('todo', 'To Do')}</option>
                    <option value="in_progress">{t('inProgress', 'In Progress')}</option>
                    <option value="review">{language === 'de' ? 'Überprüfung' : 'Review'}</option>
                    <option value="done">{t('completed', 'Completed')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                    {t('priorityLabel', 'Priority *')}
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary text-on-surface font-medium"
                  >
                    <option value="high">🌋 {t('high', 'High')}</option>
                    <option value="medium">⚡ {t('medium', 'Medium')}</option>
                    <option value="low">🌱 {t('low', 'Low')}</option>
                  </select>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                  {language === 'de' ? 'Fälligkeitsdatum (Optional)' : 'Deadline Date (Optional)'}
                </label>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary text-on-surface"
                />
              </div>

              {/* Tags Comma string */}
              <div>
                <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                  {language === 'de'
                    ? 'Schlagworte / Tags (kommagetrennt)'
                    : 'Labels / Tags (comma-separated)'}
                </label>
                <input
                  value={formTagsString}
                  onChange={(e) => setFormTagsString(e.target.value)}
                  placeholder="e.g. Phoenix, Acoustics, Writing"
                  className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/35 text-on-surface select-text font-medium"
                />
              </div>

              {/* Description textarea */}
              <div>
                <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-1 font-sans text-[10px]">
                  {t('taskDescription', 'Description')}
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={
                    language === 'de'
                      ? 'Beschreiben Sie wichtige Ergebnisse oder Details...'
                      : 'Describe key outcomes, team coordination pointers...'
                  }
                  rows={3}
                  className="w-full bg-surface-container-low border border-outline-variant/15 p-2.5 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/30 text-on-surface select-text leading-normal"
                />
              </div>

              {/* Subtask Checklist Creator */}
              <div className="border-t border-outline-variant/10 pt-4 mt-1">
                <label className="block text-on-surface-variant font-bold uppercase tracking-wider mb-2 font-sans text-[10px]">
                  {language === 'de' ? 'Teilschritte / Meilensteine' : 'Sub-Checklist / Milestones'}
                </label>

                {formChecklist.length > 0 && (
                  <ul className="flex flex-col gap-1.5 mb-3 max-h-[140px] overflow-y-auto pr-1">
                    {formChecklist.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-surface-container-low border border-outline-variant/10 select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleFormChecklistToggle(item.id)}
                            className="text-primary active:scale-95 transition-transform shrink-0 flex items-center"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {item.completed ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                          </button>
                          <span
                            className={`font-sans text-[11px] truncate select-text ${
                              item.completed
                                ? 'text-on-surface-variant/45 line-through'
                                : 'text-on-surface font-medium'
                            }`}
                          >
                            {item.text}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleFormChecklistDelete(item.id)}
                          className="text-on-surface-variant/50 hover:text-error p-1 rounded-full hover:bg-surface-bright transition-all active:scale-90 shrink-0"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2 text-xs">
                  <input
                    value={newSubTaskText}
                    onChange={(e) => setNewSubTaskText(e.target.value)}
                    onKeyDown={handleFormChecklistKeyDown}
                    placeholder={
                      language === 'de' ? 'Teilschritt hinzufügen...' : 'Add milestone sub-task...'
                    }
                    className="flex-1 bg-surface-container-low border border-outline-variant/15 px-3 py-2 rounded-xl text-xs font-sans focus:outline-primary placeholder:text-on-surface-variant/35 text-on-surface font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => handleFormChecklistAdd()}
                    className="bg-primary/10 hover:bg-primary/15 text-primary text-[10px] font-bold px-3 py-2 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    {language === 'de' ? 'Hinzufügen' : 'Add Item'}
                  </button>
                </div>
              </div>

              {/* Controls Footer buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-outline-variant/10 mt-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-on-surface text-xs font-semibold bg-surface-bright hover:bg-surface-container border border-outline-variant/25 px-4 py-2 rounded-xl transition-all cursor-pointer"
                >
                  {language === 'de' ? 'Verwerfen' : 'Discard'}
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary/95 text-on-primary text-xs font-semibold px-4.5 py-2 rounded-xl transition-all cursor-pointer"
                >
                  {t('saveTask', 'Save Task')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
