# PRP 09 - Export & Import

## 1. Feature Overview

The export feature lets users download all their todos (with subtasks and tags) as a JSON file for backup or migration. The import feature accepts that same JSON file and restores todos, remapping all IDs to avoid conflicts with existing data. Tag and subtask relationships are preserved. The export format is human-readable and self-contained.

This feature depends on PRP 01 (Todo CRUD), PRP 05 (Subtasks), and PRP 06 (Tag System).

---

## 2. User Stories

- **As a user**, I want to export all my todos as a JSON file so I have a backup.
- **As a user**, I want to import a JSON backup to restore my todos after switching devices.
- **As a user**, I want subtask relationships preserved after import so I don't lose my task structure.
- **As a user**, I want tag assignments preserved after import so my organisation is intact.
- **As a user**, I want duplicate tags matched by name on import so I don't end up with duplicate tags.

---

## 3. User Flow

### Export
1. User clicks "Export Todos" button on the main page
2. Browser triggers a JSON file download named `todos-export-YYYY-MM-DD.json`
3. File contains all todos, subtasks, and tags for the user

### Import
1. User clicks "Import Todos" button
2. A file picker opens — user selects a `.json` file
3. File is read client-side and sent to `POST /api/todos/import`
4. Server validates structure, remaps IDs, inserts records
5. Page reloads (or re-fetches) to show restored todos
6. A success message shows: "Imported X todos"

---

## 4. Technical Requirements

### Export Format (JSON)

```json
{
  "version": 1,
  "exported_at": "2026-07-03T10:00:00.000Z",
  "todos": [
    {
      "id": 1,
      "title": "Buy groceries",
      "completed": false,
      "due_date": "2026-07-10T09:00:00.000Z",
      "priority": "high",
      "recurrence_pattern": null,
      "reminder_minutes": 60,
      "created_at": "2026-07-01T08:00:00.000Z"
    }
  ],
  "subtasks": [
    {
      "id": 10,
      "todo_id": 1,
      "title": "Check fridge",
      "completed": false,
      "position": 0
    }
  ],
  "tags": [
    {
      "id": 5,
      "name": "personal",
      "color": "#10B981"
    }
  ],
  "todo_tags": [
    {
      "todo_id": 1,
      "tag_id": 5
    }
  ]
}
```

### API Endpoints

#### `GET /api/todos/export`
- **Auth**: Required
- **Logic**: Fetches all todos, subtasks, and tags for `session.userId`; assembles export object
- **Response**: `200` with `Content-Type: application/json` and `Content-Disposition: attachment; filename=todos-export-YYYY-MM-DD.json`

```typescript
// app/api/todos/export/route.ts
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todos    = todoDB.getAll(session.userId);
  const allTags  = tagDB.getByUserId(session.userId);
  const subtasks = todos.flatMap(t => subtaskDB.getByTodoId(t.id));
  const todoTags = todos.flatMap(t =>
    tagDB.getByTodoId(t.id).map(tag => ({ todo_id: t.id, tag_id: tag.id }))
  );

  // Always use getSingaporeNow() for timestamps, never new Date()
  const now = getSingaporeNow();
  const dateStr = formatSingaporeDate(now.toISOString()).replace(/\//g, '-');

  const exportData = {
    version: 1,
    exported_at: now.toISOString(),
    todos,
    subtasks,
    tags: allTags,
    todo_tags: todoTags,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-export-${dateStr}.json"`,
    },
  });
}
```

#### `POST /api/todos/import`
- **Auth**: Required
- **Body**: JSON matching the export format above
- **Logic**:
  1. Validate top-level structure (`todos`, `subtasks`, `tags`, `todo_tags` arrays present)
  2. Insert tags — match by `name` for current user; create if not exists; build `oldTagId → newTagId` map
  3. Insert todos (strip `id`, reassign `user_id`); build `oldTodoId → newTodoId` map
  4. Insert subtasks using `newTodoId` from map
  5. Insert `todo_tags` using both remapped IDs
- **Response**: `201 { imported: { todos: N, subtasks: N, tags: N } }`

```typescript
// app/api/todos/import/route.ts
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();

  // Validate structure
  if (!Array.isArray(body.todos) || !Array.isArray(body.subtasks) ||
      !Array.isArray(body.tags)  || !Array.isArray(body.todo_tags)) {
    return NextResponse.json({ error: 'Invalid import format' }, { status: 400 });
  }

  const tagIdMap:  Record<number, number> = {};
  const todoIdMap: Record<number, number> = {};

  // Insert tags (match by name or create)
  for (const tag of body.tags) {
    const existing = tagDB.getByUserIdAndName(session.userId, tag.name);
    if (existing) {
      tagIdMap[tag.id] = existing.id;
    } else {
      const newTag = tagDB.create(session.userId, tag.name, tag.color ?? '#3B82F6');
      tagIdMap[tag.id] = newTag.id;
    }
  }

  // Insert todos
  const now = getSingaporeNow().toISOString(); // Always getSingaporeNow()
  for (const todo of body.todos) {
    const newTodo = todoDB.create(session.userId, todo.title, todo.due_date ?? null, {
      priority: todo.priority ?? 'medium',
      recurrence_pattern: todo.recurrence_pattern ?? null,
      reminder_minutes: todo.reminder_minutes ?? null,
    });
    if (todo.completed) {
      todoDB.update(newTodo.id, session.userId, { completed: true });
    }
    todoIdMap[todo.id] = newTodo.id;
  }

  // Insert subtasks
  for (const subtask of body.subtasks) {
    const newTodoId = todoIdMap[subtask.todo_id];
    if (!newTodoId) continue;
    const newSubtask = subtaskDB.create(newTodoId, subtask.title);
    if (subtask.completed) {
      subtaskDB.update(newSubtask.id, { completed: true });
    }
  }

  // Insert todo_tags
  for (const tt of body.todo_tags) {
    const newTodoId = todoIdMap[tt.todo_id];
    const newTagId  = tagIdMap[tt.tag_id];
    if (newTodoId && newTagId) {
      tagDB.addToTodo(newTodoId, newTagId);
    }
  }

  return NextResponse.json({
    imported: {
      todos:    Object.keys(todoIdMap).length,
      subtasks: body.subtasks.length,
      tags:     Object.keys(tagIdMap).length,
    },
  }, { status: 201 });
}
```

> **All DB operations are synchronous** — no `async/await` on query calls.

---

## 5. UI Components

All UI additions in `app/page.tsx` (`'use client'`).

### Export Button

```tsx
const handleExport = async () => {
  const res = await fetch('/api/todos/export');
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `todos-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

<button onClick={handleExport} className="border rounded px-3 py-1 text-sm" data-testid="export-btn">
  ⬇ Export Todos
</button>
```

### Import Button + File Input

```tsx
const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    alert('Invalid JSON file');
    return;
  }

  const res = await fetch('/api/todos/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  });
  const data = await res.json();
  if (res.ok) {
    alert(`Imported ${data.imported.todos} todos`);
    await loadTodos(); // re-fetch todos list
  } else {
    alert(data.error ?? 'Import failed');
  }
  e.target.value = ''; // reset file input
};

<label className="border rounded px-3 py-1 text-sm cursor-pointer" data-testid="import-label">
  ⬆ Import Todos
  <input type="file" accept=".json" className="hidden" onChange={handleImport} data-testid="import-input" />
</label>
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| JSON file is malformed | `JSON.parse` throws → catch and show "Invalid JSON file" |
| Missing required arrays in JSON | Server returns `400 { error: 'Invalid import format' }` |
| Tag name already exists for user | Match by name, reuse existing tag (no duplicate created) |
| `todo_id` in subtasks doesn't map to imported todo | Skip that subtask silently |
| `todo_id` or `tag_id` in `todo_tags` not found in maps | Skip silently |
| Empty `todos` array | Import succeeds with 0 todos imported |
| Import of very large file (thousands of todos) | Process synchronously; no timeout issues with SQLite |
| `completed` field missing in export | Default to `false` |
| `priority` field missing in export | Default to `'medium'` |

---

## 7. Acceptance Criteria

- [ ] "Export Todos" button triggers a JSON file download
- [ ] Exported file contains `todos`, `subtasks`, `tags`, and `todo_tags` arrays
- [ ] Exported file has `version` and `exported_at` fields
- [ ] "Import Todos" button opens a file picker
- [ ] Importing a valid export file creates all todos
- [ ] Importing restores subtasks linked to correct todos
- [ ] Importing restores tag assignments (using name-match for existing tags)
- [ ] Duplicate tags are not created on import (matched by name)
- [ ] Malformed JSON file shows an error message
- [ ] Invalid structure (missing arrays) returns 400 from API
- [ ] Import success shows count of imported todos
- [ ] API returns 401 for unauthenticated requests

---

## 8. Testing Requirements

**Test file**: `tests/10-export-import.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('export downloads a JSON file', async ({ page }) => {
  await helpers.createTodo(page, 'Test export todo');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-btn"]'),
  ]);
  expect(download.suggestedFilename()).toMatch(/todos-export-.*\.json/);
});

test('export contains all todos', async ({ page }) => {
  await helpers.createTodo(page, 'Todo A');
  await helpers.createTodo(page, 'Todo B');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-testid="export-btn"]'),
  ]);
  const stream = await download.createReadStream();
  // Read and parse the file
  const content = await streamToString(stream);
  const data = JSON.parse(content);
  expect(data.todos.length).toBeGreaterThanOrEqual(2);
});

test('import restores todos', async ({ page }) => {
  // Export current state, delete all, then import
  const exportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    todos: [{ id: 1, title: 'Restored todo', completed: false, due_date: null, priority: 'medium', recurrence_pattern: null, reminder_minutes: null, created_at: new Date().toISOString() }],
    subtasks: [],
    tags: [],
    todo_tags: [],
  };
  // Upload file via file input
  await page.setInputFiles('[data-testid="import-input"]', {
    name: 'test-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exportData)),
  });
  await expect(page.locator('text=Restored todo')).toBeVisible();
});

test('import preserves subtask relationships', async ({ page }) => {
  const importData = {
    version: 1,
    exported_at: new Date().toISOString(),
    todos: [{ id: 99, title: 'Parent todo', completed: false, due_date: null, priority: 'low', recurrence_pattern: null, reminder_minutes: null, created_at: new Date().toISOString() }],
    subtasks: [{ id: 200, todo_id: 99, title: 'Child step', completed: false, position: 0 }],
    tags: [],
    todo_tags: [],
  };
  await page.setInputFiles('[data-testid="import-input"]', {
    name: 'test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importData)),
  });
  await page.click('[data-testid="expand-todo-1"]');
  await expect(page.locator('text=Child step')).toBeVisible();
});
```

### Setup Notes
- `timezoneId: 'Asia/Singapore'` in Playwright config
- Use `page.setInputFiles` to simulate file upload
- Virtual WebAuthn authenticator for login

---

## 9. Out of Scope

- CSV or XML export format
- Selective export (only completed todos, only a date range)
- Merging/deduplicating todos on import (only ID-remap)
- Import from third-party apps (Todoist, Things, etc.)
- Encrypting the export file

---

## 10. Success Metrics

- Export file downloads correctly with all data present
- Import restores 100% of todos with correct subtask and tag relationships
- All E2E tests pass with `npx playwright test tests/10-export-import.spec.ts`
- Import of 1000 todos completes in < 5 seconds
- No orphaned subtasks or `todo_tags` after import
