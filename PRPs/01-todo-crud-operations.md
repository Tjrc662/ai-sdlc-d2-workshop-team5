# PRP 01 - Todo CRUD Operations

## 1. Feature Overview

The core todo management feature allows authenticated users to create, read, update, and delete todo items. Each todo has a title, optional due date, and completion status. All date/time values are stored and displayed in **Singapore timezone** (`Asia/Singapore`). This is the foundational feature that all other PRPs build upon.

---

## 2. User Stories

- **As a user**, I want to create a new todo with a title so I can track my tasks.
- **As a user**, I want to see all my todos listed so I can get an overview of my work.
- **As a user**, I want to mark a todo as complete so I know what I have finished.
- **As a user**, I want to edit a todo's title and due date so I can keep information accurate.
- **As a user**, I want to delete a todo so I can remove tasks I no longer need.
- **As a user**, I want todos with due dates to show clearly so I can prioritize by deadline.

---

## 3. User Flow

### Create Todo
1. User types a title in the input field at the top of the page
2. Optionally selects a due date/time using a datetime-local input
3. Clicks "Add" button or presses Enter
4. Todo appears immediately at the top of the list (optimistic update)
5. API call persists to database in background

### Read Todos
1. On page load, `GET /api/todos` is called
2. Todos are rendered in a list sorted by creation date (newest first)
3. Completed todos are visually distinguished (strikethrough, muted color)

### Update Todo
1. User clicks the edit icon on a todo
2. An inline edit form appears with current values pre-filled
3. User modifies title and/or due date
4. User clicks "Save" — API call updates record
5. UI reflects changes immediately

### Delete Todo
1. User clicks the delete (trash) icon on a todo
2. A confirmation prompt appears
3. User confirms — API call deletes the record
4. Todo is removed from the list

### Toggle Completion
1. User clicks the checkbox next to a todo
2. Completion state flips immediately (optimistic update)
3. API call persists the new `completed` value

---

## 4. Technical Requirements

### Database Schema

```sql
CREATE TABLE todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0,   -- 0 = false, 1 = true
  due_date    TEXT,                          -- ISO 8601 string in SGT, nullable
  created_at  TEXT NOT NULL,                -- getSingaporeNow() ISO string
  updated_at  TEXT NOT NULL                 -- getSingaporeNow() ISO string
);
```

### TypeScript Interface (`lib/db.ts`)

```typescript
export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}
```

### API Endpoints

#### `GET /api/todos`
- **Auth**: Required — returns 401 if no session
- **Returns**: `Todo[]` for `session.userId`, ordered by `created_at DESC`
- **Response**: `200 { todos: Todo[] }`

#### `POST /api/todos`
- **Auth**: Required
- **Body**: `{ title: string, due_date?: string }`
- **Validation**: `title` must be non-empty, max 500 characters
- **Response**: `201 { todo: Todo }`

#### `GET /api/todos/[id]`
- **Auth**: Required
- **Params**: `const { id } = await params` (Next.js 16 async params)
- **Authorization**: Todo must belong to `session.userId`
- **Response**: `200 { todo: Todo }` or `404`

#### `PUT /api/todos/[id]`
- **Auth**: Required
- **Body**: `{ title?: string, completed?: boolean, due_date?: string | null }`
- **Authorization**: Todo must belong to `session.userId`
- **Updates** `updated_at` to `getSingaporeNow()`
- **Response**: `200 { todo: Todo }`

#### `DELETE /api/todos/[id]`
- **Auth**: Required
- **Authorization**: Todo must belong to `session.userId`
- **Response**: `200 { success: true }`

### Database Operations (`lib/db.ts`)

```typescript
export const todoDB = {
  getAll: (userId: number): Todo[] => {
    return db.prepare(
      'SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as Todo[];
  },
  getById: (id: number, userId: number): Todo | undefined => {
    return db.prepare(
      'SELECT * FROM todos WHERE id = ? AND user_id = ?'
    ).get(id, userId) as Todo | undefined;
  },
  create: (userId: number, title: string, dueDate: string | null): Todo => {
    const now = getSingaporeNow().toISOString();
    const result = db.prepare(
      'INSERT INTO todos (user_id, title, completed, due_date, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)'
    ).run(userId, title, dueDate, now, now);
    return todoDB.getById(result.lastInsertRowid as number, userId)!;
  },
  update: (id: number, userId: number, fields: Partial<Todo>): Todo => {
    const now = getSingaporeNow().toISOString();
    // Build dynamic SET clause from provided fields
    // Always update updated_at
    return todoDB.getById(id, userId)!;
  },
  delete: (id: number, userId: number): void => {
    db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId);
  }
};
```

> **Note**: All DB operations are **synchronous** — no `async/await` on query calls.

---

## 5. UI Components

All UI lives in `app/page.tsx` (`'use client'`). Never import `lib/db.ts` in client components.

### Add Todo Form

```tsx
// Inside app/page.tsx
const [newTitle, setNewTitle] = useState('');
const [newDueDate, setNewDueDate] = useState('');

const handleAddTodo = async () => {
  if (!newTitle.trim()) return;
  const res = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: newTitle.trim(), due_date: newDueDate || null }),
  });
  const data = await res.json();
  setTodos(prev => [data.todo, ...prev]);
  setNewTitle('');
  setNewDueDate('');
};

return (
  <div className="flex gap-2 mb-6">
    <input
      type="text"
      value={newTitle}
      onChange={e => setNewTitle(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
      placeholder="Add a new todo..."
      className="flex-1 border rounded px-3 py-2"
    />
    <input
      type="datetime-local"
      value={newDueDate}
      onChange={e => setNewDueDate(e.target.value)}
      className="border rounded px-3 py-2"
    />
    <button onClick={handleAddTodo} className="bg-blue-600 text-white px-4 py-2 rounded">
      Add
    </button>
  </div>
);
```

### Todo List Item

```tsx
{todos.map(todo => (
  <div key={todo.id} className="flex items-center gap-3 p-3 border rounded mb-2">
    <input
      type="checkbox"
      checked={todo.completed}
      onChange={() => handleToggleComplete(todo)}
    />
    <span className={todo.completed ? 'line-through text-gray-400' : ''}>
      {todo.title}
    </span>
    {todo.due_date && (
      <span className="text-sm text-gray-500 ml-auto">
        Due: {formatSingaporeDate(todo.due_date)}
      </span>
    )}
    <button onClick={() => setEditingTodo(todo)}>✏️</button>
    <button onClick={() => handleDeleteTodo(todo.id)}>🗑️</button>
  </div>
))}
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Empty title submitted | Client-side validation: trim and check length > 0; show inline error |
| Title exceeds 500 characters | Server returns `400 { error: 'Title too long' }` |
| Due date in the past | Allowed — show visual warning (yellow/orange) but do not block |
| Todo not found (deleted by another tab) | API returns `404`; client removes from list |
| Todo belongs to different user | API returns `403 { error: 'Forbidden' }` |
| Network error on create | Revert optimistic update; show error toast |
| Concurrent edits | Last write wins; `updated_at` timestamp reflects latest update |

---

## 7. Acceptance Criteria

- [ ] User can create a todo with only a title (due date optional)
- [ ] User can create a todo with a title and due date
- [ ] Todo list loads on page mount and shows all todos for the authenticated user
- [ ] Todos are ordered newest first by default
- [ ] User can toggle a todo's completion status
- [ ] Completed todos are visually distinguished (strikethrough style)
- [ ] User can edit a todo's title and/or due date
- [ ] User can delete a todo after confirmation
- [ ] Empty title is rejected client-side and server-side
- [ ] Title over 500 characters is rejected with an error message
- [ ] All dates are shown in Singapore timezone
- [ ] API returns 401 for unauthenticated requests
- [ ] API returns 403 when accessing another user's todo

---

## 8. Testing Requirements

**Test file**: `tests/02-todo-crud.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('create a todo with title only', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Buy groceries');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('text=Buy groceries')).toBeVisible();
});

test('create a todo with due date', async ({ page }) => {
  await page.fill('[data-testid="todo-input"]', 'Team meeting');
  await page.fill('[data-testid="due-date-input"]', '2026-07-10T09:00');
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('text=Team meeting')).toBeVisible();
});

test('toggle todo completion', async ({ page }) => {
  // Create then toggle
  await page.click('[data-testid="todo-checkbox-1"]');
  await expect(page.locator('[data-testid="todo-title-1"]')).toHaveClass(/line-through/);
});

test('edit a todo title', async ({ page }) => {
  await page.click('[data-testid="edit-todo-1"]');
  await page.fill('[data-testid="edit-title-input"]', 'Updated title');
  await page.click('[data-testid="save-todo-btn"]');
  await expect(page.locator('text=Updated title')).toBeVisible();
});

test('delete a todo', async ({ page }) => {
  await page.click('[data-testid="delete-todo-1"]');
  await page.click('[data-testid="confirm-delete-btn"]');
  await expect(page.locator('text=Buy groceries')).not.toBeVisible();
});

test('reject empty title', async ({ page }) => {
  await page.click('[data-testid="add-todo-btn"]');
  await expect(page.locator('[data-testid="title-error"]')).toBeVisible();
});
```

### Setup Notes
- Uses virtual WebAuthn authenticator (configured in `playwright.config.ts`)
- `timezoneId: 'Asia/Singapore'` set in Playwright browser context
- Helper `createTodo(page, title, dueDate?)` in `tests/helpers.ts`
- Each test starts from an authenticated state (login in `beforeEach`)

---

## 9. Out of Scope

- Bulk operations (delete all, complete all)
- Todo reordering via drag-and-drop
- Todo sharing between users
- Attachments or file uploads
- Rich text / markdown in todo titles
- Undo/redo actions
- Pagination (client loads all todos)

---

## 10. Success Metrics

- Todo creation completes in < 500ms (API round-trip)
- Zero data loss on concurrent operations
- All E2E tests pass with `npx playwright test tests/02-todo-crud.spec.ts`
- API returns correct HTTP status codes for all error scenarios
- All timestamps display in Singapore timezone (UTC+8)
