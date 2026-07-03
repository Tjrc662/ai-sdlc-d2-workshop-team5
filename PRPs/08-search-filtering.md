# PRP 08 - Search & Filtering

## 1. Feature Overview

The search and filtering feature lets users quickly find todos using real-time text search combined with multi-criteria filters (priority, tag, and completion status). All filtering is performed **client-side** on the already-loaded todos list — no additional API calls are needed. Filters are combined with AND logic, so multiple active filters narrow results further. Results update instantly as the user types or selects filter values.

This feature depends on PRP 01 (Todo CRUD), PRP 02 (Priority), and PRP 06 (Tag System).

---

## 2. User Stories

- **As a user**, I want to search for todos by title so I can find a specific task quickly.
- **As a user**, I want to filter todos by priority so I can focus on the most important items.
- **As a user**, I want to filter todos by tag so I can see all work or personal tasks.
- **As a user**, I want to show/hide completed todos so I can declutter my view.
- **As a user**, I want all my filters to work together simultaneously so I can narrow results precisely.
- **As a user**, I want to clear all filters at once so I can return to the full list easily.

---

## 3. User Flow

### Text Search
1. User types in the search box at the top of the todo list
2. Todo list filters in real time (debounced or immediate)
3. Matches are case-insensitive and match any part of the title
4. Clearing the search box restores all todos

### Priority Filter
1. User selects a priority from the "Priority" dropdown
2. Todo list immediately shows only todos of that priority
3. Selecting "All" removes the priority filter

### Tag Filter
1. User selects a tag from the "Tag" dropdown
2. Todo list shows only todos that have that tag assigned
3. Selecting "All Tags" removes the tag filter

### Completion Status Toggle
1. User clicks a toggle: "Show All" / "Active Only" / "Completed Only"
2. Todo list updates to show the selected group
3. Default is "Show All"

### Combined Filters
1. User applies search text + priority filter + tag filter simultaneously
2. Only todos matching ALL active criteria are shown
3. An "active filter" indicator shows when any filter is non-default
4. "Clear Filters" button resets all to defaults

---

## 4. Technical Requirements

### No New API Endpoints

All filtering is client-side. The existing `GET /api/todos` endpoint already returns all todos for the user. Tags are loaded separately via `GET /api/tags` on page mount and joined to todos in the client via the `todoTagsMap`.

### Filter State (`app/page.tsx`)

```typescript
// Filter state — all live in app/page.tsx component state
const [searchQuery, setSearchQuery]           = useState('');
const [filterPriority, setFilterPriority]     = useState<Priority | 'all'>('all');
const [filterTagId, setFilterTagId]           = useState<number | 'all'>('all');
const [filterStatus, setFilterStatus]         = useState<'all' | 'active' | 'completed'>('all');
```

### Filtered Todos (memoized)

```typescript
import { useMemo } from 'react';

const filteredTodos = useMemo(() => {
  return todos.filter(todo => {
    // Text search — case-insensitive, matches any part of title
    const matchesSearch = searchQuery.trim() === '' ||
      todo.title.toLowerCase().includes(searchQuery.trim().toLowerCase());

    // Priority filter
    const matchesPriority = filterPriority === 'all' || todo.priority === filterPriority;

    // Tag filter
    const todoTags = todoTagsMap[todo.id] ?? [];
    const matchesTag = filterTagId === 'all' ||
      todoTags.some(tag => tag.id === filterTagId);

    // Status filter
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active'    && !todo.completed) ||
      (filterStatus === 'completed' && todo.completed);

    return matchesSearch && matchesPriority && matchesTag && matchesStatus;
  });
}, [todos, searchQuery, filterPriority, filterTagId, filterStatus, todoTagsMap]);
```

### Clear All Filters

```typescript
const clearFilters = () => {
  setSearchQuery('');
  setFilterPriority('all');
  setFilterTagId('all');
  setFilterStatus('all');
};

const hasActiveFilters = searchQuery !== '' ||
  filterPriority !== 'all' ||
  filterTagId !== 'all' ||
  filterStatus !== 'all';
```

---

## 5. UI Components

All UI additions in `app/page.tsx` (`'use client'`).

### Search Input

```tsx
<input
  type="text"
  value={searchQuery}
  onChange={e => setSearchQuery(e.target.value)}
  placeholder="Search todos..."
  className="border rounded px-3 py-2 w-64"
  data-testid="search-input"
/>
```

### Filter Bar

```tsx
<div className="flex flex-wrap items-center gap-3 mb-4">
  {/* Search */}
  <input
    type="text"
    value={searchQuery}
    onChange={e => setSearchQuery(e.target.value)}
    placeholder="Search todos..."
    className="border rounded px-3 py-2 flex-1 min-w-48"
    data-testid="search-input"
  />

  {/* Priority Filter */}
  <select
    value={filterPriority}
    onChange={e => setFilterPriority(e.target.value as Priority | 'all')}
    className="border rounded px-2 py-2"
    data-testid="priority-filter"
  >
    <option value="all">All Priorities</option>
    <option value="high">🔴 High</option>
    <option value="medium">🟡 Medium</option>
    <option value="low">🟢 Low</option>
  </select>

  {/* Tag Filter */}
  <select
    value={filterTagId}
    onChange={e => setFilterTagId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
    className="border rounded px-2 py-2"
    data-testid="tag-filter"
  >
    <option value="all">All Tags</option>
    {allTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
  </select>

  {/* Status Filter */}
  <select
    value={filterStatus}
    onChange={e => setFilterStatus(e.target.value as 'all' | 'active' | 'completed')}
    className="border rounded px-2 py-2"
    data-testid="status-filter"
  >
    <option value="all">Show All</option>
    <option value="active">Active Only</option>
    <option value="completed">Completed Only</option>
  </select>

  {/* Clear Filters */}
  {hasActiveFilters && (
    <button onClick={clearFilters} className="text-sm text-red-500 underline" data-testid="clear-filters-btn">
      Clear Filters
    </button>
  )}
</div>
```

### Empty State

```tsx
{filteredTodos.length === 0 && (
  <div className="text-center py-12 text-gray-400">
    {hasActiveFilters
      ? 'No todos match your filters. Try clearing some filters.'
      : 'No todos yet. Add one above!'}
  </div>
)}
```

### Results Count

```tsx
<div className="text-sm text-gray-500 mb-2">
  Showing {filteredTodos.length} of {todos.length} todos
</div>
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Search with only whitespace | Trim before comparing — whitespace-only = no filter applied |
| All filters active with no matches | Show empty state with "No todos match your filters" |
| Tag deleted while tag filter active | `filterTagId` becomes stale; filter shows all (tag no longer in `allTags`) — reset filter |
| Very long search query | No artificial limit; browser handles input naturally |
| Accented/special characters in title | `toLowerCase().includes()` handles most cases; no special normalisation needed |
| Todos loaded async while user is typing | `useMemo` re-runs when `todos` changes — handles correctly |

---

## 7. Acceptance Criteria

- [ ] Typing in search box immediately filters todos by title (case-insensitive)
- [ ] Clearing search box restores all todos
- [ ] Priority filter shows only todos of selected priority
- [ ] Tag filter shows only todos with the selected tag
- [ ] Status filter "Active Only" hides completed todos
- [ ] Status filter "Completed Only" shows only completed todos
- [ ] All four filters can be active simultaneously (AND logic)
- [ ] "Clear Filters" button resets all filters to defaults
- [ ] "Clear Filters" button only visible when at least one filter is active
- [ ] Result count shows "Showing X of Y todos"
- [ ] Empty state message appears when filters yield zero results
- [ ] No new API calls are made when filters change (client-side only)

---

## 8. Testing Requirements

**Test file**: `tests/09-search-filtering.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('search filters by title', async ({ page }) => {
  await helpers.createTodo(page, 'Buy groceries');
  await helpers.createTodo(page, 'Team meeting');
  await page.fill('[data-testid="search-input"]', 'groceries');
  await expect(page.locator('text=Buy groceries')).toBeVisible();
  await expect(page.locator('text=Team meeting')).not.toBeVisible();
});

test('search is case-insensitive', async ({ page }) => {
  await helpers.createTodo(page, 'Buy GROCERIES');
  await page.fill('[data-testid="search-input"]', 'groceries');
  await expect(page.locator('text=Buy GROCERIES')).toBeVisible();
});

test('combine search and priority filter', async ({ page }) => {
  await helpers.createTodo(page, 'Low meeting', undefined, 'low');
  await helpers.createTodo(page, 'High meeting', undefined, 'high');
  await page.fill('[data-testid="search-input"]', 'meeting');
  await page.selectOption('[data-testid="priority-filter"]', 'high');
  await expect(page.locator('text=High meeting')).toBeVisible();
  await expect(page.locator('text=Low meeting')).not.toBeVisible();
});

test('clear filters restores full list', async ({ page }) => {
  await helpers.createTodo(page, 'Task A');
  await helpers.createTodo(page, 'Task B');
  await page.fill('[data-testid="search-input"]', 'Task A');
  await expect(page.locator('text=Task B')).not.toBeVisible();
  await page.click('[data-testid="clear-filters-btn"]');
  await expect(page.locator('text=Task B')).toBeVisible();
});

test('active only hides completed todos', async ({ page }) => {
  await helpers.createTodo(page, 'Done task');
  await page.check('[data-testid="todo-checkbox-1"]');
  await page.selectOption('[data-testid="status-filter"]', 'active');
  await expect(page.locator('text=Done task')).not.toBeVisible();
});
```

### Setup Notes
- `timezoneId: 'Asia/Singapore'` in Playwright config
- Virtual WebAuthn authenticator for login
- No API mocking needed — purely client-side behaviour

---

## 9. Out of Scope

- Server-side search (full-text search via SQLite FTS5)
- Saved/persistent filter presets
- Search within subtask titles
- Date range filtering (filter todos due within a range)
- Advanced boolean search operators (AND/OR/NOT in query)

---

## 10. Success Metrics

- Filter updates render within one paint cycle (no noticeable lag)
- No additional network requests triggered by filter changes
- All four filter types work independently and in combination
- All E2E tests pass with `npx playwright test tests/09-search-filtering.spec.ts`
- `useMemo` dependency array is correctly specified (no stale closures)
