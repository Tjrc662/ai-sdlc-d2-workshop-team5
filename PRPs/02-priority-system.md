# PRP 02 - Priority System

## 1. Feature Overview

The priority system adds three-level importance classification to todos: **High**, **Medium**, and **Low**. Each level is represented by a distinct color-coded badge. Todos are automatically sorted with higher-priority items appearing first within each completion group. Users can filter the todo list by priority level.

This feature extends the base `todos` table from PRP 01.

---

## 2. User Stories

- **As a user**, I want to assign a priority level to each todo so I can identify the most important tasks.
- **As a user**, I want high-priority todos to appear at the top of my list so I focus on urgent work first.
- **As a user**, I want color-coded badges so I can instantly identify a todo's priority at a glance.
- **As a user**, I want to filter my todos by priority so I can focus on one category at a time.
- **As a user**, I want to change a todo's priority at any time so I can adjust as circumstances change.

---

## 3. User Flow

### Assign Priority on Creation
1. User fills in the todo title
2. User selects a priority from a dropdown (High / Medium / Low); default is Medium
3. User clicks "Add"
4. Todo appears with the corresponding priority badge

### Change Priority
1. User clicks the edit icon on a todo
2. The edit form shows the current priority in a dropdown
3. User selects a new priority and saves
4. Badge updates immediately in the list

### Filter by Priority
1. User clicks the priority filter dropdown above the todo list
2. Selects "High", "Medium", "Low", or "All"
3. Todo list updates in real time (client-side filtering, no API call)

### Visual Sort Order
- Within active todos: High → Medium → Low
- Within completed todos: same sort order
- Same-priority todos sorted by `created_at DESC`

---

## 4. Technical Requirements

### Database Schema Migration

Add `priority` column to the `todos` table (migration-safe `ALTER TABLE`):

```sql
-- In lib/db.ts db.exec() with try-catch:
ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
```

Valid values: `'high'` | `'medium'` | `'low'`

### TypeScript Types (`lib/db.ts`)

```typescript
export type Priority = 'high' | 'medium' | 'low';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;          // NEW
  created_at: string;
  updated_at: string;
}
```

### Priority Sort Order Constant

```typescript
// lib/db.ts
export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
```

### API Endpoints

#### `POST /api/todos` (updated)
- **Body**: `{ title: string, due_date?: string, priority?: Priority }`
- Defaults `priority` to `'medium'` if not provided
- Validates priority is one of `['high', 'medium', 'low']`

#### `PUT /api/todos/[id]` (updated)
- **Body**: `{ title?: string, completed?: boolean, due_date?: string | null, priority?: Priority }`
- Validates priority value if provided

### Database Query (sorted)

```typescript
// lib/db.ts - getAll now sorts by priority then created_at
getAll: (userId: number): Todo[] => {
  return db.prepare(`
    SELECT * FROM todos
    WHERE user_id = ?
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC,
      created_at DESC
  `).all(userId) as Todo[];
},
```

> **Note**: All DB operations are **synchronous** — no `async/await`.

---

## 5. UI Components

All UI additions go inside `app/page.tsx` (`'use client'`).

### Priority Badge Component

```tsx
// Inside app/page.tsx
const PRIORITY_COLORS: Record<Priority, string> = {
  high:   'bg-red-100 text-red-700 border-red-300',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  low:    'bg-green-100 text-green-700 border-green-300',
};

const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PRIORITY_COLORS[priority]}`}>
    {priority.charAt(0).toUpperCase() + priority.slice(1)}
  </span>
);
```

### Priority Dropdown (Add / Edit Form)

```tsx
<select
  value={priority}
  onChange={e => setPriority(e.target.value as Priority)}
  className="border rounded px-2 py-1"
>
  <option value="high">🔴 High</option>
  <option value="medium">🟡 Medium</option>
  <option value="low">🟢 Low</option>
</select>
```

### Priority Filter

```tsx
const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');

const filteredTodos = useMemo(() =>
  todos.filter(t => filterPriority === 'all' || t.priority === filterPriority),
  [todos, filterPriority]
);

// Filter UI:
<select
  value={filterPriority}
  onChange={e => setFilterPriority(e.target.value as Priority | 'all')}
  className="border rounded px-2 py-1"
>
  <option value="all">All Priorities</option>
  <option value="high">🔴 High</option>
  <option value="medium">🟡 Medium</option>
  <option value="low">🟢 Low</option>
</select>
```

### Todo List Item (updated)

```tsx
<div key={todo.id} className="flex items-center gap-3 p-3 border rounded mb-2">
  <input type="checkbox" checked={todo.completed} onChange={() => handleToggleComplete(todo)} />
  <PriorityBadge priority={todo.priority} />
  <span className={todo.completed ? 'line-through text-gray-400' : ''}>
    {todo.title}
  </span>
  {/* ... due date, edit, delete buttons */}
</div>
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Invalid priority value sent to API | Server returns `400 { error: 'Invalid priority' }` |
| Missing priority in POST body | Defaults to `'medium'` |
| Priority column missing (old DB) | `ALTER TABLE` in `db.exec()` wrapped in try-catch — no crash |
| Priority filter + search both active | Both filters AND'd together via `useMemo` |
| All todos same priority | Falls back to `created_at DESC` sort |

---

## 7. Acceptance Criteria

- [ ] New todos default to "Medium" priority when not specified
- [ ] User can select High, Medium, or Low when creating a todo
- [ ] User can change priority when editing a todo
- [ ] Priority badge displays with correct color (red/yellow/green)
- [ ] Todos list sorts: High first, then Medium, then Low
- [ ] Within same priority, newest todos appear first
- [ ] Filtering by "High" shows only high-priority todos
- [ ] Filtering by "All" restores the full list
- [ ] Priority filter and text search can be combined
- [ ] API returns 400 for invalid priority values
- [ ] Default priority (`'medium'`) is persisted when not explicitly set

---

## 8. Testing Requirements

**Test file**: `tests/03-priority.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('create high priority todo', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Urgent task');
  await page.selectOption('[data-testid="priority-select"]', 'high');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('[data-testid="priority-badge"]').first()).toContainText('High');
});

test('high priority todos appear before medium', async ({ page }) => {
  await helpers.createTodo(page, 'Low task', undefined, 'low');
  await helpers.createTodo(page, 'High task', undefined, 'high');
  const firstTodo = page.locator('[data-testid="todo-item"]').first();
  await expect(firstTodo).toContainText('High task');
});

test('filter by high priority', async ({ page }) => {
  await helpers.createTodo(page, 'Low item', undefined, 'low');
  await helpers.createTodo(page, 'High item', undefined, 'high');
  await page.selectOption('[data-testid="priority-filter"]', 'high');
  await expect(page.locator('text=High item')).toBeVisible();
  await expect(page.locator('text=Low item')).not.toBeVisible();
});

test('change priority of existing todo', async ({ page }) => {
  await helpers.createTodo(page, 'Task', undefined, 'low');
  await page.click('[data-testid="edit-todo-1"]');
  await page.selectOption('[data-testid="edit-priority-select"]', 'high');
  await page.click('[data-testid="save-todo-btn"]');
  await expect(page.locator('[data-testid="priority-badge"]').first()).toContainText('High');
});
```

### Setup Notes
- `timezoneId: 'Asia/Singapore'` in Playwright config
- Helper `createTodo(page, title, dueDate?, priority?)` updated in `tests/helpers.ts`
- Requires authenticated session via virtual WebAuthn

---

## 9. Out of Scope

- More than three priority levels (e.g., "Critical", "Urgent")
- Custom priority names or colors per user
- Priority-based due date suggestions
- Automatic priority escalation as due date approaches
- Priority statistics or reporting

---

## 10. Success Metrics

- Priority badge renders correctly for all three levels
- Sort order is consistent after add/edit operations
- Filter reduces list to only matching priority todos
- All E2E tests pass with `npx playwright test tests/03-priority.spec.ts`
- Invalid priority values are rejected at both client and server level
