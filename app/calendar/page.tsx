'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Todo, Holiday, Priority } from '@/lib/db';

const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#10B981',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CalendarPage() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/calendar?month=${year}-${String(month).padStart(2, '0')}`);
    if (!res.ok) { router.push('/login'); return; }
    const data = await res.json();
    setTodos(data.todos ?? []);
    setHolidays(data.holidays ?? []);
    setLoading(false);
  }, [year, month, router]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  function getTodosForDay(day: number): Todo[] {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return todos.filter((t) => t.due_date && t.due_date.startsWith(dayStr));
  }

  function getHolidayForDay(day: number): Holiday | undefined {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return holidays.find((h) => h.date === dayStr);
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-blue-600 hover:underline text-sm">← Back to Todos</a>
            <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">◀ Prev</button>
            <span className="font-semibold text-gray-800 min-w-36 text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={nextMonth} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">Next ▶</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center text-gray-400 py-20">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2 border-r last:border-r-0">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="min-h-24 border-r border-b last:border-r-0 bg-gray-50" />;
                }

                const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = dayStr === todayStr;
                const holiday = getHolidayForDay(day);
                const dayTodos = getTodosForDay(day);
                const visibleTodos = dayTodos.slice(0, 3);
                const overflow = dayTodos.length - 3;

                return (
                  <div
                    key={day}
                    className={`min-h-24 border-r border-b last:border-r-0 p-1.5 ${
                      isToday ? 'bg-blue-50' : ''
                    }`}
                  >
                    {/* Day number */}
                    <div className={`text-sm font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                    }`}>
                      {day}
                    </div>

                    {/* Holiday */}
                    {holiday && (
                      <div className="text-xs text-red-500 font-medium mb-1 leading-tight truncate" title={holiday.name}>
                        🎉 {holiday.name}
                      </div>
                    )}

                    {/* Todos */}
                    {visibleTodos.map((todo) => (
                      <div
                        key={todo.id}
                        title={todo.title}
                        className={`text-xs rounded px-1 py-0.5 mb-0.5 truncate text-white ${todo.completed ? 'opacity-50' : ''}`}
                        style={{ backgroundColor: PRIORITY_COLORS[todo.priority] }}
                      >
                        {todo.title}
                      </div>
                    ))}

                    {overflow > 0 && (
                      <div className="text-xs text-gray-400">+{overflow} more</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> High priority</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Medium priority</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" /> Low priority</span>
          <span className="flex items-center gap-1"><span className="text-red-500">🎉</span> Singapore Public Holiday</span>
        </div>
      </main>
    </div>
  );
}
