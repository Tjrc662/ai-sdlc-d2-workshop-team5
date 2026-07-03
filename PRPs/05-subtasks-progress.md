# PRP 05 - Subtasks & Progress Tracking

## 1. Feature Overview

Subtasks allow users to break a todo into smaller checklist items. Each todo can have multiple subtasks with individual completion states. A visual progress bar shows the ratio of completed subtasks to total subtasks. Subtasks have an explicit position field for ordering. When a parent todo is deleted, all its subtasks are deleted via CASCADE.

This feature extends PRP 01 (Todo CRUD) and feeds into PRP 07 (Template System).

---

## 2. User Stories

- **As a user**, I want to add subtasks to a todo so I can track detailed steps within a larger task.
- **As a user**, I want to check off individual subtasks so I can see my progress within a task.
- **As a user**, I want a progress bar so I can see at a glance how complete a todo is.
- **As a user**, I want to reorder subtasks so I can sequence them logically.
- **As a user**, I want subtasks to be deleted automatically when I delete the parent todo.
- **As a user**, I want to delete individual subtasks without affecting the parent todo.

---

## 3. User Flow

### Add Subtasks
1. User expands a todo by clicking an expand/chevron button
2. A subtask section appears below the todo with an "Add subtask" input
3. User types a subtask title and presses Enter or clicks "+"
4. Subtask appears in the list with a checkbox and position number

### Complete a Subtask
1. User clicks the checkbox next to a subtask
2. Subtask is marked completed (strikethrough)
3. Progress bar updates: `(completed / total) * 100%`

### Delete a Subtask
1. User hovers over a subtask to reveal a delete button
2. User clicks delete — subtask removed immediately
3. Progress bar recalculates

### View Progress
1. Todo item shows a compact progress indicator: "2/5" or "40%"
2. Expanding the todo shows the full progress bar
3. Progress bar colour: green (100%), yellow (1–99%), gray (0%)

---

## 4. Technical Requirements

### Database Schema

```sql
CREATE TABLE subtasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id     INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0,   -- 0 = false, 1 = true
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL                 -- getSingaporeNow() ISO string
);
```

### TypeScript Interface (`lib/db.ts`)

```typescript
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}
```

### API Endpoints

#### `GET /api/todos/[id]/subtasks`
- **Auth**: Required; verify parent todo belongs to `session.userId`
- **Params**: `const { id } = await params`  — Next.js 16 async params
- **Returns**: `Subtask[]` ordered by `position ASC`
- **Response**: `200 { subtasks: Subtask[] }`

#### `POST /api/todos/[id]/subtasks`
- **Auth**: Required; verify parent todo belongs to `session.userId`
- **Body**: `{ title: string }`
- **Position**: auto-assigned as `MAX(position) + 1` for that `todo_id`
- **Response**: `201 { subtask: Subtask }`

#### `PUT /api/subtasks/[id]`
- **Auth**: Required; verify subtask's parent todo belongs to `session.userId`
- **Params**: `const { id } = await params`
- **Body**: `{ title?: string, completed?: boolean, position?: number }`
- **Response**: `200 { subtask: Subtask }`

#### `DELETE /api/subtasks/[id]`
- **Auth**: Required; verify ownership via parent todo
- **Response**: `200 { success: true }`

### Database Operations (`lib/db.ts`)

```typescript
export const subtaskDB = {
  getByTodoId: (todoId: number): Subtask[] => {
    return db.prepare(
      'SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC'
    ).all(todoId) as Subtask[];
  },
  create: (todoId: number, title: string): Subtask => {
    const now = getSingaporeNow().toISOString();
    const maxPos = (db.prepare(
      'SELECT MAX(position) as maxPos FROM subtasks WHERE todo_id = ?'
    ).get(todoId) as { maxPos: number | null }).maxPos ?? -1;

    const result = db.prepare(
      'INSERT INTO subtasks (todo_id, title, completed, position, created_at) VALUES (?, ?, 0, ?, ?)'
    ).run(todoId, title, maxPos + 1, now);
    return subtaskDB.getById(result.lastInsertRowid as number)!;
  },
  getById: (id: number): Subtask | undefined => {
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as Subtask | undefined;
  },
  update: (id: number, fields: Partial<Subtask>): Subtask => {
    // Build dynamic SET clause
    return subtaskDB.getById(id)!;
  },
  delete: (id: number): void => {
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  },
  getProgress: (todoId: number): { completed: number; total: number } => {
    const row = db.prepare(
      'SELECT COUNT(*) as total, SUM(completed) as completed FROM subtasks WHERE todo_id = ?'
    ).get(todoId) as { total: number; completed: number | null };
    return { total: row.total, completed: row.completed ?? 0 };
  },
};
```

> **All DB operations are synchronous** — no `async/await` on query calls.

---

## 5. UI Components

All UI additions in `app/page.tsx` (`'use client'`).

### Progress Bar Component

```tsx
const ProgressBar = ({ completed, total }: { completed: number; total: number }) => {
  if (total === 0) return null;
  const pct = Math.round((completed / total) * 100);
  const barColor = pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-yellow-400' : 'bg-gray-200';
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{completed}/{total}</span>
    </div>
  );
};
```

### Subtask Section (expandable, inside todo item)

```tsx
const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
const [subtasksMap, setSubtasksMap] = useState<Record<number, Subtask[]>>({});

const toggleExpand = async (todoId: number) => {
  if (!expandedTodos.has(todoId)) {
    const res = await fetch(`/api/todos/${todoId}/subtasks`);
    const data = await res.json();
    setSubtasksMap(prev => ({ ...prev, [todoId]: data.subtasks }));
  }
  setExpandedTodos(prev => {
    const next = new Set(prev);
    next.has(todoId) ? next.delete(todoId) : next.add(todoId);
    return next;
  });
};

// Subtask list render
{expandedTodos.has(todo.id) && (
  <div className="ml-8 mt-2 space-y-1">
    {(subtasksMap[todo.id] ?? []).map(subtask => (
      <div key={subtask.id} className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={subtask.completed}
          onChange={() => handleToggleSubtask(subtask)}
        />
        <span className={subtask.completed ? 'line-through text-gray-400' : ''}>
          {subtask.title}
        </span>
        <button onClick={() => handleDeleteSubtask(subtask.id)}>×</button>
      </div>
    ))}
    <AddSubtaskInput todoId={todo.id} onAdd={handleAddSubtask} />
  </div>
)}
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Todo deleted with subtasks | `ON DELETE CASCADE` in schema handles automatic deletion |
| Empty subtask title | Client-side validation; server returns `400 { error: 'Title required' }` |
| Subtask for another user's todo | Ownership check via parent todo's `user_id`; return `403` |
| Max position overflow | `MAX(position) + 1` — SQLite INTEGER handles large values |
| Deleting only subtask | Progress shows `0/0`; `ProgressBar` returns `null` when total=0 |
| Subtask `completed` field null from DB | Use `subtask.completed ?? false` |

---

## 7. Acceptance Criteria

- [ ] User can expand a todo to see its subtask section
- [ ] User can add a subtask by typing a title and pressing Enter
- [ ] User can check/uncheck individual subtasks
- [ ] Progress bar updates in real time when subtask state changes
- [ ] Progress bar is green at 100%, yellow for partial, hidden at 0 subtasks
- [ ] Compact progress count (e.g., "2/5") is visible on the collapsed todo
- [ ] User can delete an individual subtask
- [ ] Deleting a parent todo removes all subtasks (CASCADE)
- [ ] API returns 401 for unauthenticated requests
- [ ] API returns 403 when accessing subtasks of another user's todo
- [ ] Empty subtask title is rejected

---

## 8. Testing Requirements

**Test file**: `tests/06-subtasks.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('add subtask to todo', async ({ page }) => {
  await helpers.createTodo(page, 'Big project');
  await page.click('[data-testid="expand-todo-1"]');
  await page.fill('[data-testid="subtask-input-1"]', 'First step');
  await page.press('[data-testid="subtask-input-1"]', 'Enter');
  await expect(page.locator('text=First step')).toBeVisible();
});

test('progress bar updates on subtask completion', async ({ page }) => {
  await helpers.createTodo(page, 'Project');
  await helpers.addSubtask(page, 1, 'Step 1');
  await helpers.addSubtask(page, 1, 'Step 2');
  await page.click('[data-testid="subtask-checkbox-1"]');
  await expect(page.locator('[data-testid="progress-text-1"]')).toContainText('1/2');
});

test('subtasks deleted with parent todo', async ({ page }) => {
  await helpers.createTodo(page, 'Parent');
  await helpers.addSubtask(page, 1, 'Child task');
  await page.click('[data-testid="delete-todo-1"]');
  await page.click('[data-testid="confirm-delete-btn"]');
  // Verify DB has no orphaned subtasks (check via API)
  const res = await page.request.get('/api/todos/1/subtasks');
  expect(res.status()).toBe(404);
});
```

### Setup Notes
- Helper `addSubtask(page, todoId, title)` in `tests/helpers.ts`
- `timezoneId: 'Asia/Singapore'` in Playwright config
- Virtual WebAuthn authenticator for login

---

## 9. Out of Scope

- Nested subtasks (subtasks of subtasks)
- Drag-and-drop reordering of subtasks
- Subtask due dates or priorities
- Subtask assignment to other users
- Subtask comments or notes

---

## 10. Success Metrics

- Progress bar accurately reflects completed/total ratio
- Cascade delete verified with zero orphaned subtask rows
- All E2E tests pass with `npx playwright test tests/06-subtasks.spec.ts`
- Subtask CRUD operations complete in < 300ms
- `position` field ensures consistent ordering across page reloads
