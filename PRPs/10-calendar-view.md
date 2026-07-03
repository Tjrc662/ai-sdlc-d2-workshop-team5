# PRP 10 - Calendar View

## 1. Feature Overview

The calendar view provides a monthly grid display of todos organised by their due dates. Users can navigate between months using previous/next buttons. Singapore public holidays are highlighted on their calendar cells. Todos due on a given day appear as compact pills within that cell. Clicking a todo pill navigates back to the main list with that todo highlighted. The calendar is a separate protected route (`/calendar`).

This feature depends on PRP 01 (Todo CRUD) and the Singapore holidays seed data.

---

## 2. User Stories

- **As a user**, I want to see my todos on a monthly calendar so I can visualise my workload over time.
- **As a user**, I want to navigate between months so I can plan ahead or review the past.
- **As a user**, I want to see Singapore public holidays on the calendar so I can plan around them.
- **As a user**, I want todo pills on the calendar to show the todo title so I know what's due.
- **As a user**, I want to click a todo pill to go to its detail so I can act on it.
- **As a user**, I want the current day highlighted so I can orient myself quickly.

---

## 3. User Flow

### Open Calendar
1. User navigates to `http://localhost:3000/calendar`
2. Middleware verifies session — redirects to `/login` if not authenticated
3. Calendar loads with the current month displayed

### Navigate Months
1. User clicks "◀ Prev" button — previous month loads
2. User clicks "Next ▶" button — next month loads
3. Month/year heading updates (e.g., "July 2026")

### View Todos on Calendar
1. Todos with a `due_date` in the current month appear on their respective day cells
2. Each todo is shown as a colored pill (color matches its priority)
3. Cells with more than 3 todos show "+N more" overflow indicator

### Public Holidays
1. Cells matching Singapore holiday dates show the holiday name in small text
2. Holiday cells have a subtle background highlight (e.g., light red)

### Click Todo Pill
1. User clicks a todo pill on the calendar
2. Browser navigates to `/?highlight=<todoId>` (the main page with the todo highlighted)

---

## 4. Technical Requirements

### Database Schema — Holidays Table

```sql
CREATE TABLE holidays (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  date  TEXT NOT NULL UNIQUE,   -- 'YYYY-MM-DD' in Singapore timezone
  name  TEXT NOT NULL
);
```

### Seed Script (`scripts/seed-holidays.ts`)

```typescript
import { db } from '../lib/db';

const SG_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-29', name: 'Chinese New Year' },
  { date: '2026-01-30', name: 'Chinese New Year (Day 2)' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-12', name: 'Vesak Day' },
  { date: '2026-06-04', name: 'Hari Raya Haji' },
  { date: '2026-08-09', name: 'National Day' },
  { date: '2026-10-20', name: 'Deepavali' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

const insert = db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)');
SG_HOLIDAYS_2026.forEach(h => insert.run(h.date, h.name));
console.log('Holidays seeded');
```

Run with: `npx tsx scripts/seed-holidays.ts`

### TypeScript Interface (`lib/db.ts`)

```typescript
export interface Holiday {
  id: number;
  date: string;    // 'YYYY-MM-DD'
  name: string;
}
```

### API Endpoints

#### `GET /api/todos?month=YYYY-MM`
- **Auth**: Required
- **Query param**: `month` e.g. `2026-07`
- **Returns**: todos with `due_date LIKE 'YYYY-MM-%'` for `session.userId`
- **Response**: `200 { todos: Todo[] }`

```typescript
// app/api/todos/route.ts — update GET handler
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month'); // e.g. '2026-07'

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const todos = db.prepare(
      "SELECT * FROM todos WHERE user_id = ? AND due_date LIKE ? ORDER BY due_date ASC"
    ).all(session.userId, `${month}-%`) as Todo[];
    return NextResponse.json({ todos });
  }

  const todos = todoDB.getAll(session.userId);
  return NextResponse.json({ todos });
}
```

#### `GET /api/holidays?month=YYYY-MM`
- **Auth**: Required
- **Returns**: `Holiday[]` for the given month
- **Response**: `200 { holidays: Holiday[] }`

```typescript
// app/api/holidays/route.ts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format' }, { status: 400 });
  }

  const holidays = db.prepare(
    "SELECT * FROM holidays WHERE date LIKE ?"
  ).all(`${month}-%`) as Holiday[];

  return NextResponse.json({ holidays });
}
```

> **All DB operations are synchronous** — no `async/await` on query calls.

### Calendar Middleware Protection

`middleware.ts` already protects `/calendar` — verify `'/calendar'` is in the matcher config:

```typescript
export const config = {
  matcher: ['/', '/calendar'],
};
```

---

## 5. UI Components

**File**: `app/calendar/page.tsx` (new file, `'use client'`)

```typescript
'use client';
import { useState, useEffect, useMemo } from 'react';
import { getSingaporeNow } from '@/lib/timezone';
import type { Todo, Holiday } from '@/lib/db';

export default function CalendarPage() {
  const today = getSingaporeNow(); // Always use getSingaporeNow(), never new Date()

  const [currentYear,  setCurrentYear]  = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [todos,        setTodos]        = useState<Todo[]>([]);
  const [holidays,     setHolidays]     = useState<Holiday[]>([]);

  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  useEffect(() => {
    fetch(`/api/todos?month=${monthStr}`)
      .then(r => r.json()).then(d => setTodos(d.todos ?? []));
    fetch(`/api/holidays?month=${monthStr}`)
      .then(r => r.json()).then(d => setHolidays(d.holidays ?? []));
  }, [monthStr]);

  // Build calendar grid
  const firstDay  = new Date(currentYear, currentMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const todosByDate = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    todos.forEach(todo => {
      if (!todo.due_date) return;
      const dateKey = todo.due_date.slice(0, 10); // 'YYYY-MM-DD'
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(todo);
    });
    return map;
  }, [todos]);

  const holidaysByDate = useMemo(() => {
    const map: Record<string, Holiday> = {};
    holidays.forEach(h => { map[h.date] = h; });
    return map;
  }, [holidays]);

  const PRIORITY_PILL_COLORS: Record<string, string> = {
    high:   'bg-red-200 text-red-800',
    medium: 'bg-yellow-200 text-yellow-800',
    low:    'bg-green-200 text-green-800',
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0); }
    else setCurrentMonth(m => m + 1);
  };

  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={prevMonth} className="px-3 py-1 border rounded">◀ Prev</button>
        <h1 className="text-xl font-bold">{MONTH_NAMES[currentMonth]} {currentYear}</h1>
        <button onClick={nextMonth} className="px-3 py-1 border rounded">Next ▶</button>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 mb-px">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="bg-gray-100 text-center text-xs font-medium py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200">
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} className="bg-white h-24" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayTodos    = todosByDate[dateKey] ?? [];
          const holiday     = holidaysByDate[dateKey];
          const isToday     = day === today.getDate() &&
                              currentMonth === today.getMonth() &&
                              currentYear  === today.getFullYear();

          return (
            <div
              key={day}
              className={`bg-white h-24 p-1 overflow-hidden ${isToday ? 'ring-2 ring-blue-500' : ''} ${holiday ? 'bg-red-50' : ''}`}
            >
              <div className="flex items-start justify-between">
                <span className={`text-sm font-medium ${isToday ? 'bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>
                  {day}
                </span>
                {holiday && (
                  <span className="text-xs text-red-500 truncate max-w-16" title={holiday.name}>
                    {holiday.name}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-0.5 overflow-hidden">
                {dayTodos.slice(0, 3).map(todo => (
                  <a
                    key={todo.id}
                    href={`/?highlight=${todo.id}`}
                    className={`block text-xs px-1 rounded truncate ${PRIORITY_PILL_COLORS[todo.priority]}`}
                    title={todo.title}
                  >
                    {todo.title}
                  </a>
                ))}
                {dayTodos.length > 3 && (
                  <span className="text-xs text-gray-400">+{dayTodos.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <a href="/" className="text-blue-600 underline text-sm">← Back to Todo List</a>
      </div>
    </div>
  );
}
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Month with 28 days (Feb non-leap) | `new Date(year, month + 1, 0).getDate()` correctly returns 28 |
| Todo `due_date` is null | `todosByDate` skips todos without a due date |
| Cell has many todos | Show first 3 + "+N more" overflow indicator |
| Holiday on same day as today | Both `ring-2 ring-blue-500` and `bg-red-50` applied |
| No holidays in database | Empty `holidays` array; no error |
| Month param validation fails | API returns 400; calendar shows empty grid |
| User navigates to past months | Works; todos from past dates still shown |

---

## 7. Acceptance Criteria

- [ ] Calendar page is accessible at `/calendar`
- [ ] Unauthenticated users are redirected to `/login` by middleware
- [ ] Current month is displayed on initial load
- [ ] Month/year heading updates correctly on prev/next navigation
- [ ] Todos with due dates appear on the correct day cells
- [ ] Todo pills are colored by priority (red/yellow/green)
- [ ] Cells with > 3 todos show "+N more" overflow
- [ ] Singapore public holidays are highlighted with their name
- [ ] Current day has a visible highlight (blue ring)
- [ ] Clicking a todo pill navigates to `/?highlight=<id>`
- [ ] All date calculations use Singapore timezone (`getSingaporeNow()`)

---

## 8. Testing Requirements

**Test file**: `tests/11-calendar.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('calendar page loads current month', async ({ page }) => {
  await page.goto('/calendar');
  const now = new Date();
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  await expect(page.locator('h1')).toContainText(MONTHS[now.getMonth()]);
});

test('todo appears on correct calendar day', async ({ page }) => {
  await helpers.createTodo(page, 'Meeting', '2026-07-15T10:00');
  await page.goto('/calendar');
  const cell15 = page.locator('[data-testid="calendar-cell-15"]');
  await expect(cell15).toContainText('Meeting');
});

test('navigate to next month', async ({ page }) => {
  await page.goto('/calendar');
  await page.click('[data-testid="next-month-btn"]');
  // Verify month heading changed
  const heading = page.locator('h1');
  await expect(heading).not.toContainText('July 2026'); // was July
});

test('holiday shown on correct date', async ({ page }) => {
  await page.goto('/calendar?month=2026-08');
  // August 9 is National Day
  const cell = page.locator('[data-testid="calendar-cell-9"]');
  await expect(cell).toContainText('National Day');
});

test('unauthenticated redirect', async ({ browser }) => {
  const context = await browser.newContext(); // fresh context, no auth
  const page = await context.newPage();
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});
```

### Setup Notes
- `timezoneId: 'Asia/Singapore'` in Playwright config (critical for date assertions)
- Seed holidays before running tests: `npx tsx scripts/seed-holidays.ts`
- Virtual WebAuthn authenticator for login
- Add `data-testid="calendar-cell-{day}"` to each day cell in implementation

---

## 9. Out of Scope

- Week or day view
- Drag-and-drop to reschedule todos from calendar
- Creating todos directly from calendar cells
- Calendar sync with Google Calendar / iCal
- Past-year holiday data (seed covers current year only)

---

## 10. Success Metrics

- Calendar renders current month in < 500ms
- Month navigation loads new data within one second
- Public holidays appear on correct cells after seeding
- All E2E tests pass with `npx playwright test tests/11-calendar.spec.ts`
- Singapore timezone used for all date comparisons (verified with `timezoneId: 'Asia/Singapore'`)
