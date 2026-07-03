# PRP 03 - Recurring Todos

## 1. Feature Overview

Recurring todos automatically create the next instance of a task when the current one is completed. Users can set a recurrence pattern (daily, weekly, monthly, yearly) on any todo. Upon completion, the system calculates the next due date using Singapore timezone arithmetic and inserts a new todo with all the same metadata (priority, tags, reminder offset, recurrence pattern). The completed instance remains in the list as a historical record.

This feature extends PRP 01 (Todo CRUD) and integrates with PRP 02 (Priority).

---

## 2. User Stories

- **As a user**, I want to mark a todo as recurring so it reappears automatically after I complete it.
- **As a user**, I want to choose daily, weekly, monthly, or yearly recurrence so it fits my schedule.
- **As a user**, I want the next instance to inherit all my settings (priority, tags, reminders) so I don't re-configure it.
- **As a user**, I want to see the recurrence pattern on a todo so I know it will repeat.
- **As a user**, I want to stop recurrence at any time by editing the todo and removing the pattern.

---

## 3. User Flow

### Set Up Recurring Todo
1. User creates (or edits) a todo
2. User checks a "Repeat" checkbox in the form
3. A pattern dropdown appears: Daily / Weekly / Monthly / Yearly
4. User selects a pattern and sets a due date (required for recurring todos)
5. User saves — todo is created/updated with the pattern stored

### Complete a Recurring Todo
1. User clicks the checkbox to complete the todo
2. API detects `recurrence_pattern` is set
3. API calculates the next due date:
   - Daily: +1 day from current `due_date`
   - Weekly: +7 days
   - Monthly: +1 calendar month
   - Yearly: +1 calendar year
4. API creates a new todo with the same title, priority, reminder_minutes, recurrence_pattern, and all associated tags
5. The completed todo remains; the new todo appears in the active list

### Remove Recurrence
1. User clicks edit on a recurring todo
2. User unchecks the "Repeat" checkbox
3. `recurrence_pattern` is set to `null` on save
4. No new instance is created on next completion

---

## 4. Technical Requirements

### Database Schema Migration

```sql
-- In lib/db.ts db.exec() with try-catch:
ALTER TABLE todos ADD COLUMN recurrence_pattern TEXT;
-- Valid values: 'daily' | 'weekly' | 'monthly' | 'yearly' | NULL
```

### TypeScript Types (`lib/db.ts`)

```typescript
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;   // NEW
  created_at: string;
  updated_at: string;
}
```

### Due Date Calculation (Singapore Timezone)

```typescript
// lib/timezone.ts — add helper functions
import { getSingaporeNow } from '@/lib/timezone';
import { RecurrencePattern } from '@/lib/db';

export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern
): string {
  // Parse as Singapore date — NEVER use new Date() directly
  const current = new Date(currentDueDate);

  switch (pattern) {
    case 'daily':
      current.setDate(current.getDate() + 1);
      break;
    case 'weekly':
      current.setDate(current.getDate() + 7);
      break;
    case 'monthly':
      current.setMonth(current.getMonth() + 1);
      break;
    case 'yearly':
      current.setFullYear(current.getFullYear() + 1);
      break;
  }
  return current.toISOString();
}
```

### API Endpoints

#### `PUT /api/todos/[id]` (updated completion logic)

```typescript
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;  // Next.js 16: params is a Promise
  const body = await request.json();
  const todo = todoDB.getById(Number(id), session.userId);
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Handle recurring completion
  if (body.completed === true && todo.recurrence_pattern && todo.due_date) {
    const nextDueDate = calculateNextDueDate(todo.due_date, todo.recurrence_pattern);

    // Create next instance with same metadata
    const nextTodo = todoDB.create(session.userId, todo.title, nextDueDate, {
      priority: todo.priority,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes ?? null,
    });

    // Copy tags to next instance
    const tags = tagDB.getByTodoId(todo.id);
    tags.forEach(tag => tagDB.addToTodo(nextTodo.id, tag.id));
  }

  const updatedTodo = todoDB.update(Number(id), session.userId, body);
  return NextResponse.json({ todo: updatedTodo });
}
```

#### `POST /api/todos` (updated)
- **Body**: `{ title, due_date?, priority?, recurrence_pattern? }`
- `recurrence_pattern` validated against `['daily', 'weekly', 'monthly', 'yearly']`

#### `GET /api/todos` — no change needed; `recurrence_pattern` returned in payload

### Database Operations

```typescript
// lib/db.ts
export const todoDB = {
  create: (
    userId: number,
    title: string,
    dueDate: string | null,
    opts?: { priority?: Priority; recurrence_pattern?: RecurrencePattern | null; reminder_minutes?: number | null }
  ): Todo => {
    const now = getSingaporeNow().toISOString();
    const result = db.prepare(`
      INSERT INTO todos (user_id, title, completed, due_date, priority, recurrence_pattern, reminder_minutes, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, title, dueDate,
      opts?.priority ?? 'medium',
      opts?.recurrence_pattern ?? null,
      opts?.reminder_minutes ?? null,
      now, now
    );
    return todoDB.getById(result.lastInsertRowid as number, userId)!;
  },
  // ...
};
```

> **All DB operations are synchronous** — no `async/await` on query calls.

---

## 5. UI Components

All UI additions live in `app/page.tsx` (`'use client'`).

### Recurrence Checkbox + Dropdown (Add / Edit Form)

```tsx
const [isRecurring, setIsRecurring] = useState(false);
const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>('daily');

<div className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={isRecurring}
    onChange={e => setIsRecurring(e.target.checked)}
    id="repeat-checkbox"
  />
  <label htmlFor="repeat-checkbox">Repeat</label>
  {isRecurring && (
    <select
      value={recurrencePattern}
      onChange={e => setRecurrencePattern(e.target.value as RecurrencePattern)}
      className="border rounded px-2 py-1"
    >
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
      <option value="yearly">Yearly</option>
    </select>
  )}
</div>
```

### Recurrence Badge on Todo List Item

```tsx
{todo.recurrence_pattern && (
  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded border border-blue-200">
    🔁 {todo.recurrence_pattern.charAt(0).toUpperCase() + todo.recurrence_pattern.slice(1)}
  </span>
)}
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Recurring todo has no `due_date` | Block completion trigger for next instance; show warning "Set a due date for recurring todos" |
| Invalid `recurrence_pattern` value | Server returns `400 { error: 'Invalid recurrence pattern' }` |
| User deletes a recurring todo | Only deletes that instance; no cascade to future instances (they don't exist yet) |
| Monthly recurrence on Jan 31 | `setMonth(+1)` → Feb 31 → browser normalises to Mar 2/3; acceptable behaviour |
| Null coalescing on `recurrence_pattern` | Always use `todo.recurrence_pattern ?? null` when reading |
| Completing already-completed recurring todo | No-op for next-instance creation (check `!todo.completed` before creating next) |

---

## 7. Acceptance Criteria

- [ ] User can mark any todo as recurring with a pattern
- [ ] Recurrence pattern badge appears on recurring todos
- [ ] Completing a daily recurring todo creates a new todo due the next day (SGT)
- [ ] Completing a weekly recurring todo creates a new todo due in 7 days (SGT)
- [ ] Completing a monthly recurring todo creates a new todo due next calendar month (SGT)
- [ ] Completing a yearly recurring todo creates a new todo due next calendar year (SGT)
- [ ] Next instance inherits: title, priority, recurrence_pattern, reminder_minutes
- [ ] Next instance inherits all tags from the completed todo
- [ ] Completed recurring todo remains in history
- [ ] User can remove recurrence by editing and unchecking "Repeat"
- [ ] Recurring todo without a due_date shows a warning and does not create next instance
- [ ] API validates `recurrence_pattern` values and returns 400 for invalid ones

---

## 8. Testing Requirements

**Test file**: `tests/04-recurring-todos.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('create daily recurring todo', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Daily standup');
  await page.fill('[data-testid="due-date-input"]', '2026-07-10T09:00');
  await page.check('[data-testid="repeat-checkbox"]');
  await page.selectOption('[data-testid="recurrence-select"]', 'daily');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('text=🔁 Daily')).toBeVisible();
});

test('completing recurring todo creates next instance', async ({ page }) => {
  // Create todo with tomorrow's date
  await helpers.createRecurringTodo(page, 'Daily standup', '2026-07-10T09:00', 'daily');
  await page.click('[data-testid="todo-checkbox-1"]');
  // Verify new instance exists with next day's date
  await expect(page.locator('text=Daily standup')).toHaveCount(2);
});

test('next instance inherits priority', async ({ page }) => {
  await helpers.createRecurringTodo(page, 'High task', '2026-07-10T09:00', 'daily', 'high');
  await page.click('[data-testid="todo-checkbox-1"]');
  const badges = page.locator('[data-testid="priority-badge"]');
  await expect(badges.first()).toContainText('High');
});

test('remove recurrence pattern', async ({ page }) => {
  await helpers.createRecurringTodo(page, 'Task', '2026-07-10T09:00', 'weekly');
  await page.click('[data-testid="edit-todo-1"]');
  await page.uncheck('[data-testid="repeat-checkbox"]');
  await page.click('[data-testid="save-todo-btn"]');
  await expect(page.locator('text=🔁')).not.toBeVisible();
});
```

### Setup Notes
- `timezoneId: 'Asia/Singapore'` in Playwright config
- Helper `createRecurringTodo(page, title, dueDate, pattern, priority?)` in `tests/helpers.ts`
- Verify next due date offset by checking displayed due date text

---

## 9. Out of Scope

- Custom recurrence intervals (e.g., "every 3 days")
- End date / "repeat N times" limits
- Recurrence on specific days of week (e.g., "every Monday")
- Skipping/postponing a single occurrence
- Editing all future instances at once
- Recurrence without a due date

---

## 10. Success Metrics

- Next instance created within the same API response as completion
- Correct due date offset calculated for all four patterns in Singapore timezone
- Tags and priority correctly inherited by next instance
- All E2E tests pass with `npx playwright test tests/04-recurring-todos.spec.ts`
- No orphaned instances created for non-recurring todos
