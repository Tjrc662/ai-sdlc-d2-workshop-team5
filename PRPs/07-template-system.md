# PRP 07 - Template System

## 1. Feature Overview

The template system lets users save a todo's configuration as a reusable pattern. Templates capture: title, priority, recurrence pattern, reminder offset, and subtasks. When a user applies a template, a new todo is created with all stored settings. An optional `due_date_offset` field specifies how many days from today to set the due date. Templates are user-scoped and stored in a dedicated `templates` table.

This feature depends on PRP 01 (Todo CRUD), PRP 02 (Priority), PRP 03 (Recurring), PRP 04 (Reminders), and PRP 05 (Subtasks).

---

## 2. User Stories

- **As a user**, I want to save a todo as a template so I can quickly recreate common tasks.
- **As a user**, I want templates to remember subtasks so I don't have to re-enter them every time.
- **As a user**, I want to set a day-offset on a template so the due date is automatically calculated from today.
- **As a user**, I want to apply a template with one click to create a fully configured todo instantly.
- **As a user**, I want to delete templates I no longer need.
- **As a user**, I want to see all my templates in one place to manage them.

---

## 3. User Flow

### Save a Todo as Template
1. User opens an existing todo's edit form (or a "Save as Template" button on the todo item)
2. User clicks "Save as Template"
3. A modal asks for:
   - Template name (required)
   - Due date offset in days (optional, e.g., "3" means due 3 days from application)
4. User confirms — template saved with all current todo settings + serialized subtasks

### Use a Template
1. User clicks "Use Template" button on the main page
2. A modal lists all user templates
3. User clicks a template to apply it
4. A new todo is created with:
   - `title` from template
   - `priority` from template
   - `recurrence_pattern` from template
   - `reminder_minutes` from template
   - `due_date` = today + `due_date_offset` days (if offset set, using `getSingaporeNow()`)
   - Subtasks created from the JSON subtasks array
5. New todo appears in the list immediately

### Delete a Template
1. In the template manager modal, user clicks delete (×) on a template
2. Template is removed; existing todos created from it are unaffected

---

## 4. Technical Requirements

### Database Schema

```sql
CREATE TABLE templates (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  title               TEXT NOT NULL,
  priority            TEXT NOT NULL DEFAULT 'medium',
  recurrence_pattern  TEXT,
  reminder_minutes    INTEGER,
  due_date_offset     INTEGER,    -- days from today when applying, nullable
  subtasks            TEXT,       -- JSON: [{ title: string, position: number }]
  created_at          TEXT NOT NULL
);
```

### TypeScript Interface (`lib/db.ts`)

```typescript
export interface Template {
  id: number;
  user_id: number;
  name: string;
  title: string;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset: number | null;
  subtasks: string;    // JSON string — parse before use
  created_at: string;
}

// Parsed subtasks shape:
export interface TemplateSubtask {
  title: string;
  position: number;
}
```

### Subtasks JSON Serialization

```typescript
// When saving a template:
const subtasksJson = JSON.stringify(
  subtasks.map((s, i) => ({ title: s.title, position: s.position ?? i }))
);

// When reading a template:
const templateSubtasks: TemplateSubtask[] = JSON.parse(template.subtasks || '[]');
```

### API Endpoints

#### `GET /api/templates`
- **Auth**: Required
- **Returns**: `Template[]` for `session.userId` ordered by `name ASC`
- **Response**: `200 { templates: Template[] }`

#### `POST /api/templates`
- **Auth**: Required
- **Body**: `{ name, title, priority, recurrence_pattern?, reminder_minutes?, due_date_offset?, subtasks? }`
- **Validation**: name non-empty; serialize subtasks to JSON string before insert
- **Response**: `201 { template: Template }`

#### `DELETE /api/templates/[id]`
- **Auth**: Required; template must belong to `session.userId`
- **Params**: `const { id } = await params`
- **Response**: `200 { success: true }`

#### `POST /api/templates/[id]/use`
- **Auth**: Required
- **Params**: `const { id } = await params`
- **Logic**:
  1. Fetch template, verify ownership
  2. Calculate `due_date`: if `due_date_offset` set → `getSingaporeNow()` + offset days; else `null`
  3. Create todo with template fields
  4. Parse `template.subtasks` JSON and create each subtask
- **Response**: `201 { todo: Todo }`

### Due Date Calculation

```typescript
// app/api/templates/[id]/use/route.ts
import { getSingaporeNow } from '@/lib/timezone';

function calculateDueDateFromOffset(offsetDays: number | null): string | null {
  if (offsetDays === null) return null;
  // Always use getSingaporeNow(), never new Date()
  const now = getSingaporeNow();
  now.setDate(now.getDate() + offsetDays);
  return now.toISOString();
}
```

### Database Operations (`lib/db.ts`)

```typescript
export const templateDB = {
  getByUserId: (userId: number): Template[] => {
    return db.prepare(
      'SELECT * FROM templates WHERE user_id = ? ORDER BY name ASC'
    ).all(userId) as Template[];
  },
  getById: (id: number, userId: number): Template | undefined => {
    return db.prepare(
      'SELECT * FROM templates WHERE id = ? AND user_id = ?'
    ).get(id, userId) as Template | undefined;
  },
  create: (userId: number, data: Omit<Template, 'id' | 'user_id' | 'created_at'>): Template => {
    const now = getSingaporeNow().toISOString();
    const result = db.prepare(`
      INSERT INTO templates (user_id, name, title, priority, recurrence_pattern, reminder_minutes, due_date_offset, subtasks, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, data.name, data.title, data.priority,
      data.recurrence_pattern ?? null,
      data.reminder_minutes ?? null,
      data.due_date_offset ?? null,
      typeof data.subtasks === 'string' ? data.subtasks : JSON.stringify(data.subtasks ?? []),
      now
    );
    return templateDB.getById(result.lastInsertRowid as number, userId)!;
  },
  delete: (id: number, userId: number): void => {
    db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId);
  },
};
```

> **All DB operations are synchronous** — no `async/await` on query calls.

---

## 5. UI Components

All UI additions in `app/page.tsx` (`'use client'`).

### Save as Template Button (on todo item)

```tsx
const handleSaveAsTemplate = async (todo: Todo) => {
  const name = prompt('Template name:');
  if (!name?.trim()) return;
  const offsetStr = prompt('Due date offset in days (optional, leave blank for none):');
  const offset = offsetStr ? parseInt(offsetStr, 10) : null;

  const subtasks = subtasksMap[todo.id] ?? [];
  await fetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.trim(),
      title: todo.title,
      priority: todo.priority,
      recurrence_pattern: todo.recurrence_pattern ?? null,
      reminder_minutes: todo.reminder_minutes ?? null,
      due_date_offset: offset,
      subtasks: JSON.stringify(subtasks.map(s => ({ title: s.title, position: s.position }))),
    }),
  });
  // Refresh templates list
  await loadTemplates();
};
```

### Use Template Modal

```tsx
const [showTemplates, setShowTemplates] = useState(false);
const [templates, setTemplates] = useState<Template[]>([]);

const handleUseTemplate = async (templateId: number) => {
  const res = await fetch(`/api/templates/${templateId}/use`, { method: 'POST' });
  const data = await res.json();
  if (res.ok) {
    setTodos(prev => [data.todo, ...prev]);
    setShowTemplates(false);
  }
};

{showTemplates && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-96 max-h-96 overflow-y-auto">
      <h2 className="font-bold text-lg mb-4">Use Template</h2>
      {templates.map(template => (
        <div key={template.id} className="flex items-center justify-between mb-3 p-2 border rounded">
          <div>
            <div className="font-medium">{template.name}</div>
            <div className="text-sm text-gray-500">{template.title}</div>
            {template.due_date_offset && (
              <div className="text-xs text-gray-400">Due in {template.due_date_offset} days</div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleUseTemplate(template.id)}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
              Use
            </button>
            <button onClick={() => handleDeleteTemplate(template.id)}>×</button>
          </div>
        </div>
      ))}
      <button onClick={() => setShowTemplates(false)} className="mt-4 text-gray-500">Close</button>
    </div>
  </div>
)}
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Template subtasks JSON malformed | Wrap `JSON.parse` in try-catch; fallback to `[]` |
| `due_date_offset` = 0 | Due date = today (getSingaporeNow() with no offset) |
| Negative `due_date_offset` | Allowed — creates todo with past due date; show warning in UI |
| Template deleted after "Use" flow starts | API fetches template first; returns `404` if not found |
| `reminder_minutes` is `undefined` | Always store as `null`: `data.reminder_minutes ?? null` |
| Template name empty | Server returns `400 { error: 'Template name required' }` |
| Applying template creates subtasks atomically | Use a transaction if DB supports it; otherwise fail gracefully |

---

## 7. Acceptance Criteria

- [ ] User can save a todo as a template with a name
- [ ] Template stores: title, priority, recurrence_pattern, reminder_minutes, subtasks, due_date_offset
- [ ] Subtasks are serialized as JSON string in the `subtasks` column
- [ ] User can see all templates in a modal
- [ ] Applying a template creates a fully configured todo
- [ ] Due date is `today + due_date_offset` days (using Singapore timezone) when offset is set
- [ ] Subtasks from template are created as actual `subtasks` rows on the new todo
- [ ] User can delete a template without affecting existing todos
- [ ] API returns 401 for unauthenticated requests
- [ ] API returns 403 when accessing another user's templates

---

## 8. Testing Requirements

**Test file**: `tests/08-templates.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('save todo as template', async ({ page }) => {
  await helpers.createTodo(page, 'Weekly report');
  // Click save as template and enter name
  await page.click('[data-testid="save-template-1"]');
  await page.fill('[data-testid="template-name-input"]', 'Report Template');
  await page.click('[data-testid="confirm-save-template-btn"]');
  await page.click('[data-testid="use-template-btn"]');
  await expect(page.locator('text=Report Template')).toBeVisible();
});

test('apply template creates todo with correct settings', async ({ page }) => {
  // Save a high-priority todo as template with 3-day offset
  await helpers.saveAsTemplate(page, 1, 'My Template', 3);
  await page.click('[data-testid="use-template-btn"]');
  await page.click('[data-testid="apply-template-My Template"]');
  // Verify todo created with correct priority and due date
  const newTodo = page.locator('[data-testid="todo-item"]').first();
  await expect(newTodo).toBeVisible();
});

test('template subtasks created on apply', async ({ page }) => {
  await helpers.createTodo(page, 'Project');
  await helpers.addSubtask(page, 1, 'Step 1');
  await helpers.addSubtask(page, 1, 'Step 2');
  await helpers.saveAsTemplate(page, 1, 'Project Template', null);
  await helpers.applyTemplate(page, 'Project Template');
  // Find the newest todo and verify it has 2 subtasks
  await page.click('[data-testid="expand-todo-1"]');
  await expect(page.locator('[data-testid="subtask-item"]')).toHaveCount(2);
});
```

### Setup Notes
- Helper `saveAsTemplate(page, todoId, name, offsetDays)` in `tests/helpers.ts`
- Helper `applyTemplate(page, templateName)` in `tests/helpers.ts`
- `timezoneId: 'Asia/Singapore'` in Playwright config

---

## 9. Out of Scope

- Template sharing between users
- Template versioning
- Template categories / folders
- Editing an existing template (delete and recreate)
- Template import/export (separate from todo export/import)

---

## 10. Success Metrics

- Template application creates todo and all subtasks in a single API call
- `due_date_offset` correctly applied relative to Singapore timezone today
- Subtasks JSON round-trips correctly (serialize on save, parse on apply)
- All E2E tests pass with `npx playwright test tests/08-templates.spec.ts`
- Zero orphaned subtasks on failed template application
