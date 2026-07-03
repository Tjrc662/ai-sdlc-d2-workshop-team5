# PRP 06 - Tag System

## 1. Feature Overview

The tag system allows users to organise todos with color-coded labels. Tags are user-scoped (each user manages their own set). A todo can have multiple tags (many-to-many relationship). Tags have a user-defined name and a hex color. Users can filter the todo list by tag. Tags are managed through a dedicated modal (create, rename, delete). Deleting a tag removes it from all associated todos.

This feature extends PRP 01 (Todo CRUD) and feeds into PRP 08 (Search & Filtering).

---

## 2. User Stories

- **As a user**, I want to create tags with custom names and colors so I can categorize my todos.
- **As a user**, I want to assign multiple tags to a todo so it can belong to several categories.
- **As a user**, I want to filter todos by tag so I can focus on a specific category.
- **As a user**, I want to see color-coded tag badges on todos so I can identify categories instantly.
- **As a user**, I want to delete a tag and have it automatically removed from all todos.
- **As a user**, I want tag names to be unique within my account so there's no confusion.

---

## 3. User Flow

### Manage Tags (Create / Delete)
1. User clicks "Manage Tags" button to open the tag manager modal
2. User enters a tag name and selects a color from a color picker
3. User clicks "Create Tag" — tag appears in the list
4. User can click the delete (×) button next to a tag to remove it
5. Confirmation: "Deleting this tag will remove it from all todos"

### Assign Tags to a Todo
1. User opens the edit form for a todo (or the inline tag picker)
2. A list of all user tags appears with checkboxes
3. User checks/unchecks tags
4. On save, the `todo_tags` junction table is updated

### Filter by Tag
1. User selects a tag from the tag filter dropdown above the todo list
2. Todo list filters client-side to show only todos with that tag
3. "All Tags" option restores the full list

---

## 4. Technical Requirements

### Database Schema

```sql
CREATE TABLE tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#3B82F6',  -- hex color string
  UNIQUE(user_id, name)
);

CREATE TABLE todo_tags (
  todo_id    INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);
```

### TypeScript Interface (`lib/db.ts`)

```typescript
export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;    // hex e.g. '#EF4444'
}
```

### API Endpoints

#### `GET /api/tags`
- **Auth**: Required
- **Returns**: `Tag[]` for `session.userId` ordered by `name ASC`
- **Response**: `200 { tags: Tag[] }`

#### `POST /api/tags`
- **Auth**: Required
- **Body**: `{ name: string, color: string }`
- **Validation**: name non-empty, max 50 chars; color is valid 6-digit hex (`#[0-9A-Fa-f]{6}`)
- **Constraint**: unique per user (`UNIQUE(user_id, name)`)
- **Response**: `201 { tag: Tag }` or `409 { error: 'Tag name already exists' }`

#### `DELETE /api/tags/[id]`
- **Auth**: Required; tag must belong to `session.userId`
- **Params**: `const { id } = await params`
- **Cascade**: `ON DELETE CASCADE` on `todo_tags` removes junction rows automatically
- **Response**: `200 { success: true }`

#### `GET /api/todos/[id]/tags`
- **Auth**: Required; parent todo must belong to `session.userId`
- **Returns**: `Tag[]` for the given todo
- **Response**: `200 { tags: Tag[] }`

#### `POST /api/todos/[id]/tags`
- **Auth**: Required; verify ownership
- **Body**: `{ tagId: number }`
- **Response**: `201 { success: true }` or `409` if already assigned

#### `DELETE /api/todos/[id]/tags/[tagId]`
- **Auth**: Required; verify ownership
- **Params**: `const { id, tagId } = await params`
- **Response**: `200 { success: true }`

### Database Operations (`lib/db.ts`)

```typescript
export const tagDB = {
  getByUserId: (userId: number): Tag[] => {
    return db.prepare(
      'SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC'
    ).all(userId) as Tag[];
  },
  create: (userId: number, name: string, color: string): Tag => {
    const result = db.prepare(
      'INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)'
    ).run(userId, name.trim(), color);
    return tagDB.getById(result.lastInsertRowid as number)!;
  },
  getById: (id: number): Tag | undefined => {
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
  },
  delete: (id: number, userId: number): void => {
    db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(id, userId);
  },
  getByTodoId: (todoId: number): Tag[] => {
    return db.prepare(`
      SELECT tags.* FROM tags
      INNER JOIN todo_tags ON tags.id = todo_tags.tag_id
      WHERE todo_tags.todo_id = ?
    `).all(todoId) as Tag[];
  },
  addToTodo: (todoId: number, tagId: number): void => {
    db.prepare(
      'INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)'
    ).run(todoId, tagId);
  },
  removeFromTodo: (todoId: number, tagId: number): void => {
    db.prepare(
      'DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?'
    ).run(todoId, tagId);
  },
};
```

> **All DB operations are synchronous** — no `async/await` on query calls.

---

## 5. UI Components

All UI additions in `app/page.tsx` (`'use client'`).

### Tag Badge Component

```tsx
const TagBadge = ({ tag }: { tag: Tag }) => (
  <span
    className="text-xs px-2 py-0.5 rounded border font-medium"
    style={{
      backgroundColor: `${tag.color}20`,   // 12% opacity background
      borderColor: tag.color,
      color: tag.color,
    }}
  >
    {tag.name}
  </span>
);
```

### Tag Manager Modal

```tsx
const [showTagManager, setShowTagManager] = useState(false);
const [allTags, setAllTags] = useState<Tag[]>([]);
const [newTagName, setNewTagName] = useState('');
const [newTagColor, setNewTagColor] = useState('#3B82F6');

const handleCreateTag = async () => {
  if (!newTagName.trim()) return;
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
  });
  const data = await res.json();
  if (res.ok) {
    setAllTags(prev => [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTagName('');
  }
};

// Modal render:
{showTagManager && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-96">
      <h2 className="font-bold text-lg mb-4">Manage Tags</h2>
      <div className="flex gap-2 mb-4">
        <input
          value={newTagName}
          onChange={e => setNewTagName(e.target.value)}
          placeholder="Tag name"
          className="flex-1 border rounded px-2 py-1"
          maxLength={50}
        />
        <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)} />
        <button onClick={handleCreateTag} className="bg-blue-600 text-white px-3 py-1 rounded">
          Create
        </button>
      </div>
      {allTags.map(tag => (
        <div key={tag.id} className="flex items-center justify-between mb-2">
          <TagBadge tag={tag} />
          <button onClick={() => handleDeleteTag(tag.id)}>×</button>
        </div>
      ))}
      <button onClick={() => setShowTagManager(false)} className="mt-4 text-gray-500">
        Close
      </button>
    </div>
  </div>
)}
```

### Tag Filter Dropdown

```tsx
const [filterTagId, setFilterTagId] = useState<number | 'all'>('all');

const filteredTodos = useMemo(() =>
  todos.filter(t =>
    filterTagId === 'all' || (todoTagsMap[t.id] ?? []).some(tag => tag.id === filterTagId)
  ),
  [todos, filterTagId, todoTagsMap]
);

<select value={filterTagId} onChange={e => setFilterTagId(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
  <option value="all">All Tags</option>
  {allTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
</select>
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Duplicate tag name for same user | DB `UNIQUE` constraint → API returns `409 { error: 'Tag name already exists' }` |
| Invalid hex color format | Server validates with `/^#[0-9A-Fa-f]{6}$/`; returns `400` |
| Delete tag with todos assigned | `ON DELETE CASCADE` on `todo_tags` auto-removes junction rows |
| Assign same tag twice to a todo | `INSERT OR IGNORE` prevents duplicate junction rows |
| Tag belongs to different user | Ownership check in API; return `403` |
| Tag name empty or whitespace | Server trims and checks length; returns `400` |
| Max tag name length exceeded | Server returns `400 { error: 'Name too long' }` (max 50 chars) |

---

## 7. Acceptance Criteria

- [ ] User can create a tag with a name and hex color
- [ ] Duplicate tag names (same user) are rejected with an error
- [ ] Tag badge displays with the user-defined color
- [ ] User can assign one or more tags to a todo
- [ ] User can remove a tag from a todo
- [ ] Deleting a tag removes it from all todos automatically
- [ ] Filtering by tag shows only todos with that tag
- [ ] "All Tags" filter restores the full unfiltered list
- [ ] Tag filter can be combined with priority filter and text search
- [ ] API returns 401 for unauthenticated requests
- [ ] API returns 403 when accessing another user's tags

---

## 8. Testing Requirements

**Test file**: `tests/07-tags.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('create a tag', async ({ page }) => {
  await page.click('[data-testid="manage-tags-btn"]');
  await page.fill('[data-testid="tag-name-input"]', 'work');
  await page.click('[data-testid="create-tag-btn"]');
  await expect(page.locator('text=work')).toBeVisible();
});

test('assign tag to todo', async ({ page }) => {
  await helpers.createTag(page, 'urgent', '#EF4444');
  await helpers.createTodo(page, 'Important task');
  await page.click('[data-testid="edit-todo-1"]');
  await page.check('[data-testid="tag-checkbox-urgent"]');
  await page.click('[data-testid="save-todo-btn"]');
  await expect(page.locator('[data-testid="tag-badge-urgent"]')).toBeVisible();
});

test('filter by tag', async ({ page }) => {
  await helpers.createTag(page, 'personal', '#10B981');
  await helpers.createTodo(page, 'Gym session');
  // Assign tag then filter
  await page.selectOption('[data-testid="tag-filter"]', 'personal');
  await expect(page.locator('text=Gym session')).toBeVisible();
});

test('delete tag removes from todos', async ({ page }) => {
  await helpers.createTag(page, 'temp', '#6B7280');
  await helpers.createTodo(page, 'Tagged todo');
  // Assign tag, then delete it
  await page.click('[data-testid="manage-tags-btn"]');
  await page.click('[data-testid="delete-tag-temp"]');
  await page.click('[data-testid="confirm-delete-tag-btn"]');
  await expect(page.locator('[data-testid="tag-badge-temp"]')).not.toBeVisible();
});
```

### Setup Notes
- Helper `createTag(page, name, color)` in `tests/helpers.ts`
- `timezoneId: 'Asia/Singapore'` in Playwright config
- Virtual WebAuthn authenticator for login

---

## 9. Out of Scope

- Shared tags between users
- Tag hierarchies or parent-child tag relationships
- Tag usage analytics
- Tag-based bulk operations
- Auto-tagging based on keywords

---

## 10. Success Metrics

- Tag creation, assignment, and removal work without page reload
- Filter correctly reduces todo list to tagged items only
- Cascade delete leaves zero orphaned `todo_tags` rows
- All E2E tests pass with `npx playwright test tests/07-tags.spec.ts`
- Tag color renders correctly in all badge positions
