'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Todo, Tag, Subtask, Template, Priority, RecurrencePattern } from '@/lib/db';
import { useNotifications } from '@/lib/hooks/useNotifications';

interface TodoWithMeta extends Todo {
  tags: Tag[];
  subtasks: Subtask[];
}

const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const REMINDER_OPTIONS = [
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
  { value: 10080, label: '1 week before' },
];

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [todos, setTodos] = useState<TodoWithMeta[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  // New todo form state
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newRecurrence, setNewRecurrence] = useState<RecurrencePattern | ''>('');
  const [newReminder, setNewReminder] = useState<number | ''>('');
  const [newTagIds, setNewTagIds] = useState<number[]>([]);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editRecurrence, setEditRecurrence] = useState<RecurrencePattern | ''>('');
  const [editReminder, setEditReminder] = useState<number | ''>('');
  const [editTagIds, setEditTagIds] = useState<number[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterTag, setFilterTag] = useState<number | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('all');

  // Subtask state
  const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
  const [newSubtaskTitles, setNewSubtaskTitles] = useState<Record<number, string>>({});

  // Tag manager state
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');

  // Template state
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // Notification hook
  useNotifications();

  // ─── Data Loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [sessionRes, todosRes, tagsRes, templatesRes] = await Promise.all([
        fetch('/api/auth/session'),
        fetch('/api/todos'),
        fetch('/api/tags'),
        fetch('/api/templates'),
      ]);

      if (!sessionRes.ok) { router.push('/login'); return; }
      const session = await sessionRes.json();
      setUsername(session.username);

      if (todosRes.ok) setTodos(await todosRes.json());
      if (tagsRes.ok) setTags(await tagsRes.json());
      if (templatesRes.ok) setTemplates(await templatesRes.json());
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Filtered Todos ─────────────────────────────────────────────────────────

  const filteredTodos = useMemo(() => {
    return todos.filter((todo) => {
      if (searchQuery && !todo.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        // Also check tags
        const tagMatch = todo.tags.some((t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (!tagMatch) return false;
      }
      if (filterPriority !== 'all' && todo.priority !== filterPriority) return false;
      if (filterTag !== 'all' && !todo.tags.some((t) => t.id === filterTag)) return false;
      if (filterStatus === 'active' && todo.completed) return false;
      if (filterStatus === 'completed' && !todo.completed) return false;
      return true;
    });
  }, [todos, searchQuery, filterPriority, filterTag, filterStatus]);

  // ─── Todo CRUD ──────────────────────────────────────────────────────────────

  async function addTodo() {
    if (!newTitle.trim()) return;
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle,
        priority: newPriority,
        due_date: newDueDate || null,
        recurrence_pattern: newRecurrence || null,
        reminder_minutes: newReminder || null,
        tag_ids: newTagIds,
      }),
    });
    if (res.ok) {
      const todo = await res.json();
      setTodos((prev) => [todo, ...prev]);
      setNewTitle('');
      setNewDueDate('');
      setNewRecurrence('');
      setNewReminder('');
      setNewTagIds([]);
      setNewPriority('medium');
    }
  }

  async function toggleTodo(todo: TodoWithMeta) {
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !todo.completed }),
    });
    if (res.ok) {
      await loadData(); // Reload to catch recurring next instance
    }
  }

  async function deleteTodo(id: number) {
    if (!confirm('Delete this todo?')) return;
    const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    if (res.ok) setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  function startEdit(todo: TodoWithMeta) {
    setEditingId(todo.id);
    setEditTitle(todo.title);
    setEditPriority(todo.priority);
    setEditDueDate(todo.due_date ? new Date(todo.due_date).toISOString().slice(0, 16) : '');
    setEditRecurrence(todo.recurrence_pattern ?? '');
    setEditReminder(todo.reminder_minutes ?? '');
    setEditTagIds(todo.tags.map((t) => t.id));
  }

  async function saveEdit(id: number) {
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        priority: editPriority,
        due_date: editDueDate || null,
        recurrence_pattern: editRecurrence || null,
        reminder_minutes: editReminder || null,
        tag_ids: editTagIds,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setEditingId(null);
    }
  }

  // ─── Subtasks ───────────────────────────────────────────────────────────────

  function toggleExpand(id: number) {
    setExpandedTodos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function addSubtask(todoId: number) {
    const title = newSubtaskTitles[todoId]?.trim();
    if (!title) return;
    const existingSubtasks = todos.find((t) => t.id === todoId)?.subtasks ?? [];
    const res = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, position: existingSubtasks.length }),
    });
    if (res.ok) {
      const sub = await res.json();
      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, subtasks: [...t.subtasks, sub] } : t))
      );
      setNewSubtaskTitles((prev) => ({ ...prev, [todoId]: '' }));
    }
  }

  async function toggleSubtask(todoId: number, subtask: Subtask) {
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !subtask.completed }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTodos((prev) =>
        prev.map((t) =>
          t.id === todoId
            ? { ...t, subtasks: t.subtasks.map((s) => (s.id === subtask.id ? updated : s)) }
            : t
        )
      );
    }
  }

  async function deleteSubtask(todoId: number, subtaskId: number) {
    const res = await fetch(`/api/subtasks/${subtaskId}`, { method: 'DELETE' });
    if (res.ok) {
      setTodos((prev) =>
        prev.map((t) =>
          t.id === todoId ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) } : t
        )
      );
    }
  }

  // ─── Tags ────────────────────────────────────────────────────────────────────

  async function createTag() {
    if (!newTagName.trim()) return;
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTagName, color: newTagColor }),
    });
    if (res.ok) {
      const tag = await res.json();
      setTags((prev) => [...prev, tag]);
      setNewTagName('');
      setNewTagColor('#3B82F6');
    }
  }

  async function deleteTag(id: number) {
    if (!confirm('Delete this tag? It will be removed from all todos.')) return;
    const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setTags((prev) => prev.filter((t) => t.id !== id));
      setTodos((prev) =>
        prev.map((t) => ({ ...t, tags: t.tags.filter((tag) => tag.id !== id) }))
      );
    }
  }

  // ─── Templates ───────────────────────────────────────────────────────────────

  async function saveAsTemplate(todo: TodoWithMeta) {
    if (!templateName.trim()) return;
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: templateName,
        title: todo.title,
        priority: todo.priority,
        recurrence_pattern: todo.recurrence_pattern,
        reminder_minutes: todo.reminder_minutes,
        subtasks: todo.subtasks.map((s) => ({ title: s.title, position: s.position })),
      }),
    });
    if (res.ok) {
      const tmpl = await res.json();
      setTemplates((prev) => [...prev, tmpl]);
      setTemplateName('');
      setShowSaveTemplate(false);
    }
  }

  async function useTemplate(templateId: number) {
    const res = await fetch(`/api/templates/${templateId}/use`, { method: 'POST' });
    if (res.ok) {
      const todo = await res.json();
      setTodos((prev) => [todo, ...prev]);
      setShowTemplates(false);
    }
  }

  async function deleteTemplate(id: number) {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  // ─── Export / Import ────────────────────────────────────────────────────────

  async function handleExport() {
    const res = await fetch('/api/todos/export');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'todos-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch { alert('Invalid JSON file'); return; }
    const res = await fetch('/api/todos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const result = await res.json();
      alert(`Imported ${result.imported} todos`);
      loadData();
    }
    e.target.value = '';
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading…</div>
      </div>
    );
  }

  const activeTodos = todos.filter((t) => !t.completed).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Todo App</h1>
            <p className="text-xs text-gray-500">Welcome, {username}</p>
          </div>
          <div className="flex gap-2">
            <a href="/calendar" className="text-sm text-blue-600 hover:underline px-3 py-1.5 rounded border">
              📅 Calendar
            </a>
            <button onClick={() => setShowTagManager(true)} className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">
              🏷 Tags
            </button>
            <button onClick={() => setShowTemplates(true)} className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50">
              📋 Templates
            </button>
            <button onClick={handleLogout} className="text-sm px-3 py-1.5 rounded border text-red-600 hover:bg-red-50">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Add Todo Form */}
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h2 className="font-semibold text-gray-700">New Todo</h2>
          <input
            type="text"
            placeholder="What needs to be done?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as Priority)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="high">🔴 High</option>
              <option value="medium">🟡 Medium</option>
              <option value="low">🟢 Low</option>
            </select>
            <input
              type="datetime-local"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            />
            <select
              value={newRecurrence}
              onChange={(e) => setNewRecurrence(e.target.value as RecurrencePattern | '')}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">No repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <select
              value={newReminder}
              onChange={(e) => setNewReminder(e.target.value ? Number(e.target.value) : '')}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">No reminder</option>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {/* Tag selection */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() =>
                    setNewTagIds((prev) =>
                      prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                    )
                  }
                  style={{ backgroundColor: newTagIds.includes(tag.id) ? tag.color : undefined }}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    newTagIds.includes(tag.id)
                      ? 'text-white border-transparent'
                      : 'text-gray-600 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={addTodo}
            disabled={!newTitle.trim()}
            className="w-full bg-blue-600 text-white rounded-lg py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            + Add Todo
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Search todos…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-40 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as Priority | 'all')}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="all">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'completed')}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="flex gap-3 text-xs text-gray-500">
            <span>{activeTodos} active · {todos.length - activeTodos} completed</span>
            <div className="ml-auto flex gap-2">
              <button onClick={handleExport} className="text-blue-600 hover:underline">Export</button>
              <label className="text-blue-600 hover:underline cursor-pointer">
                Import
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* Todo List */}
        <div className="space-y-3">
          {filteredTodos.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              {searchQuery || filterPriority !== 'all' || filterTag !== 'all' || filterStatus !== 'all'
                ? 'No todos match the current filters.'
                : 'No todos yet. Add one above!'}
            </div>
          )}

          {filteredTodos.map((todo) => {
            const completedSubtasks = todo.subtasks.filter((s) => s.completed).length;
            const totalSubtasks = todo.subtasks.length;
            const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
            const isExpanded = expandedTodos.has(todo.id);

            return (
              <div
                key={todo.id}
                className={`bg-white rounded-xl border transition-opacity ${todo.completed ? 'opacity-60' : ''}`}
              >
                <div className="p-4">
                  {editingId === todo.id ? (
                    // Edit mode
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        autoFocus
                      />
                      <div className="flex flex-wrap gap-2">
                        <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as Priority)} className="border rounded px-2 py-1 text-sm">
                          <option value="high">🔴 High</option>
                          <option value="medium">🟡 Medium</option>
                          <option value="low">🟢 Low</option>
                        </select>
                        <input type="datetime-local" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                        <select value={editRecurrence} onChange={(e) => setEditRecurrence(e.target.value as RecurrencePattern | '')} className="border rounded px-2 py-1 text-sm">
                          <option value="">No repeat</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                        <select value={editReminder} onChange={(e) => setEditReminder(e.target.value ? Number(e.target.value) : '')} className="border rounded px-2 py-1 text-sm">
                          <option value="">No reminder</option>
                          {REMINDER_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <button
                              key={tag.id}
                              onClick={() =>
                                setEditTagIds((prev) =>
                                  prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                                )
                              }
                              style={{ backgroundColor: editTagIds.includes(tag.id) ? tag.color : undefined }}
                              className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                editTagIds.includes(tag.id)
                                  ? 'text-white border-transparent'
                                  : 'text-gray-600 border-gray-300'
                              }`}
                            >
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(todo.id)} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">Save</button>
                        <button onClick={() => setEditingId(null)} className="border px-4 py-1.5 rounded text-sm hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={!!todo.completed}
                          onChange={() => toggleTodo(todo)}
                          className="mt-1 w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${todo.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {todo.title}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[todo.priority]}`}>
                              {todo.priority}
                            </span>
                            {todo.recurrence_pattern && (
                              <span className="text-xs text-blue-500">↻ {todo.recurrence_pattern}</span>
                            )}
                          </div>
                          {/* Tags */}
                          {todo.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {todo.tags.map((tag) => (
                                <span
                                  key={tag.id}
                                  style={{ backgroundColor: tag.color }}
                                  className="text-white text-xs px-2 py-0.5 rounded-full"
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Due date */}
                          {todo.due_date && (
                            <p className="text-xs text-gray-400 mt-1">
                              📅 {new Date(todo.due_date).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}
                              {todo.reminder_minutes && ` · 🔔 ${REMINDER_OPTIONS.find(o => o.value === todo.reminder_minutes)?.label ?? ''}`}
                            </p>
                          )}
                          {/* Subtask progress */}
                          {totalSubtasks > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                  <div
                                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400">{completedSubtasks}/{totalSubtasks}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex gap-1 shrink-0">
                          {totalSubtasks > 0 && (
                            <button
                              onClick={() => toggleExpand(todo.id)}
                              className="text-gray-400 hover:text-gray-600 px-1 text-sm"
                            >
                              {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                          <button
                            onClick={() => toggleExpand(todo.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1"
                            title="Toggle subtasks"
                          >
                            ✏️
                          </button>
                          <button onClick={() => startEdit(todo)} className="text-xs text-blue-500 hover:text-blue-700 px-1">Edit</button>
                          <button
                            onClick={() => { setShowSaveTemplate(true); setTemplateName(todo.title); }}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1"
                            title="Save as template"
                          >
                            📋
                          </button>
                          <button onClick={() => deleteTodo(todo.id)} className="text-xs text-red-400 hover:text-red-600 px-1">✕</button>
                        </div>
                      </div>

                      {/* Edit/expand button for subtasks */}
                      <button
                        onClick={() => toggleExpand(todo.id)}
                        className="mt-1 text-xs text-gray-400 hover:text-gray-600 ml-7"
                      >
                        {isExpanded ? '▲ Hide subtasks' : `▼ ${totalSubtasks > 0 ? `${totalSubtasks} subtask${totalSubtasks > 1 ? 's' : ''}` : 'Add subtasks'}`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Subtasks Panel */}
                {isExpanded && (
                  <div className="border-t px-4 pb-3 pt-2 bg-gray-50 rounded-b-xl space-y-2">
                    {todo.subtasks.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!sub.completed}
                          onChange={() => toggleSubtask(todo.id, sub)}
                          className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                        />
                        <span className={`flex-1 text-sm ${sub.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {sub.title}
                        </span>
                        <button onClick={() => deleteSubtask(todo.id, sub.id)} className="text-xs text-red-300 hover:text-red-500">✕</button>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        placeholder="Add subtask…"
                        value={newSubtaskTitles[todo.id] ?? ''}
                        onChange={(e) =>
                          setNewSubtaskTitles((prev) => ({ ...prev, [todo.id]: e.target.value }))
                        }
                        onKeyDown={(e) => e.key === 'Enter' && addSubtask(todo.id)}
                        className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button onClick={() => addSubtask(todo.id)} className="bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-200">
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Tag Manager Modal */}
      {showTagManager && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Manage Tags</h2>
              <button onClick={() => setShowTagManager(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createTag()}
                className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-10 h-9 rounded border cursor-pointer"
              />
              <button onClick={createTag} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
                Add
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tags.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No tags yet</p>}
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center gap-3">
                  <span
                    style={{ backgroundColor: tag.color }}
                    className="w-4 h-4 rounded-full shrink-0"
                  />
                  <span className="flex-1 text-sm">{tag.name}</span>
                  <button onClick={() => deleteTag(tag.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Templates</h2>
              <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {templates.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No templates yet. Save a todo as a template using the 📋 button.
                </p>
              )}
              {templates.map((tmpl) => (
                <div key={tmpl.id} className="flex items-center gap-3 border rounded-lg p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{tmpl.name}</p>
                    <p className="text-xs text-gray-400">{tmpl.title} · {tmpl.priority}</p>
                  </div>
                  <button
                    onClick={() => useTemplate(tmpl.id)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
                  >
                    Use
                  </button>
                  <button onClick={() => deleteTemplate(tmpl.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold">Save as Template</h2>
            <input
              type="text"
              placeholder="Template name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const todo = filteredTodos.find((t) => t.title === templateName) ?? filteredTodos[0];
                  if (todo) saveAsTemplate(todo);
                }}
                className="flex-1 bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => { setShowSaveTemplate(false); setTemplateName(''); }}
                className="flex-1 border py-2 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
