# PRP 04 - Reminders & Notifications

## 1. Feature Overview

The reminders system lets users set a time-based notification before a todo's due date. The browser displays a native notification at the configured offset (e.g., 15 minutes before, 1 day before). A polling mechanism checks for due reminders every minute. Duplicate notifications are prevented by tracking `last_notification_sent` per todo. All time calculations use **Singapore timezone** (`Asia/Singapore`).

This feature extends PRP 01 (Todo CRUD) and requires browser Notification API permission.

---

## 2. User Stories

- **As a user**, I want to set a reminder on a todo so my browser alerts me before the due time.
- **As a user**, I want to choose how far in advance to be reminded (15 min to 1 week) to suit different task types.
- **As a user**, I want to receive the notification only once per due period so I am not spammed.
- **As a user**, I want to enable notifications once and have them work for all future todos automatically.
- **As a user**, I want to see which todos have reminders set at a glance.

---

## 3. User Flow

### Enable Notifications
1. User clicks "Enable Notifications" button on the main page
2. Browser prompts for permission (Notification API)
3. User grants permission — button changes to "Notifications Enabled ✓"
4. If denied, button shows "Notifications Blocked" and displays guidance to re-enable in browser settings

### Set a Reminder
1. User creates or edits a todo with a due date
2. User selects a reminder offset from a dropdown:
   - 15 minutes before
   - 30 minutes before
   - 1 hour before
   - 2 hours before
   - 1 day before
   - 2 days before
   - 1 week before
3. User saves — `reminder_minutes` stored in database

### Notification Trigger
1. `useNotifications` hook polls `/api/notifications/check` every 60 seconds
2. API checks all todos for current user where:
   - `completed = 0`
   - `due_date IS NOT NULL`
   - `reminder_minutes IS NOT NULL`
   - `(due_date - reminder_minutes) <= now <= due_date`
   - `last_notification_sent` is NULL or > 1 hour ago (duplicate prevention)
3. API returns list of todos whose reminders are due
4. Hook fires `new Notification(...)` for each, updates `last_notification_sent`

---

## 4. Technical Requirements

### Database Schema Migration

```sql
-- In lib/db.ts db.exec() with try-catch:
ALTER TABLE todos ADD COLUMN reminder_minutes INTEGER;
ALTER TABLE todos ADD COLUMN last_notification_sent TEXT;
```

### Valid Reminder Offsets

```typescript
// lib/db.ts
export const REMINDER_OPTIONS = [
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before',     value: 60 },
  { label: '2 hours before',    value: 120 },
  { label: '1 day before',      value: 1440 },
  { label: '2 days before',     value: 2880 },
  { label: '1 week before',     value: 10080 },
] as const;

export type ReminderMinutes = typeof REMINDER_OPTIONS[number]['value'];
```

### TypeScript Interface Update (`lib/db.ts`)

```typescript
export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;                // NEW
  last_notification_sent: string | null;          // NEW
  created_at: string;
  updated_at: string;
}
```

### API Endpoint: `GET /api/notifications/check`

```typescript
// app/api/notifications/check/route.ts
import { getSingaporeNow } from '@/lib/timezone';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = getSingaporeNow();  // Always use getSingaporeNow(), never new Date()

  // Find todos with due reminders
  const dueTodos = db.prepare(`
    SELECT * FROM todos
    WHERE user_id = ?
      AND completed = 0
      AND due_date IS NOT NULL
      AND reminder_minutes IS NOT NULL
      AND datetime(due_date, '-' || reminder_minutes || ' minutes') <= datetime(?)
      AND datetime(due_date) >= datetime(?)
      AND (last_notification_sent IS NULL
           OR datetime(last_notification_sent) < datetime(?, '-1 hour'))
  `).all(session.userId, now.toISOString(), now.toISOString(), now.toISOString());

  // Update last_notification_sent for returned todos
  const updateStmt = db.prepare(
    "UPDATE todos SET last_notification_sent = ? WHERE id = ?"
  );
  dueTodos.forEach((todo: any) => {
    updateStmt.run(now.toISOString(), todo.id);
  });

  return NextResponse.json({ todos: dueTodos });
}
```

### Notification Hook (`lib/hooks/useNotifications.ts`)

```typescript
'use client';
import { useEffect, useCallback } from 'react';

export function useNotifications() {
  const checkReminders = useCallback(async () => {
    if (Notification.permission !== 'granted') return;
    try {
      const res = await fetch('/api/notifications/check');
      const data = await res.json();
      (data.todos ?? []).forEach((todo: { title: string; due_date: string }) => {
        new Notification(`Reminder: ${todo.title}`, {
          body: `Due: ${todo.due_date}`,
          icon: '/favicon.ico',
        });
      });
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(checkReminders, 60_000); // Poll every 60s
    checkReminders(); // Check immediately on mount
    return () => clearInterval(interval);
  }, [checkReminders]);

  const requestPermission = async () => {
    return Notification.requestPermission();
  };

  return { requestPermission };
}
```

### API Endpoints (updated)

#### `POST /api/todos` — add `reminder_minutes` to body
#### `PUT /api/todos/[id]` — add `reminder_minutes` to body, always `?? null`

```typescript
reminder_minutes: body.reminder_minutes ?? null,
```

> **All DB operations are synchronous** — no `async/await` on query calls.

---

## 5. UI Components

All UI additions in `app/page.tsx` (`'use client'`).

### Enable Notifications Button

```tsx
const { requestPermission } = useNotifications();
const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

useEffect(() => {
  if ('Notification' in window) {
    setNotifPermission(Notification.permission);
  }
}, []);

const handleEnableNotifications = async () => {
  const permission = await requestPermission();
  setNotifPermission(permission);
};

<button
  onClick={handleEnableNotifications}
  disabled={notifPermission === 'granted'}
  className="px-3 py-1 rounded border text-sm"
>
  {notifPermission === 'granted'
    ? '🔔 Notifications Enabled'
    : notifPermission === 'denied'
    ? '🔕 Notifications Blocked'
    : '🔔 Enable Notifications'}
</button>
```

### Reminder Dropdown (Add / Edit Form)

```tsx
import { REMINDER_OPTIONS } from '@/lib/db';

<select
  value={reminderMinutes ?? ''}
  onChange={e => setReminderMinutes(e.target.value ? Number(e.target.value) : null)}
  className="border rounded px-2 py-1"
>
  <option value="">No reminder</option>
  {REMINDER_OPTIONS.map(opt => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>
```

### Reminder Indicator on Todo

```tsx
{todo.reminder_minutes && (
  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded border border-purple-200">
    🔔 {REMINDER_OPTIONS.find(o => o.value === todo.reminder_minutes)?.label ?? `${todo.reminder_minutes}m`}
  </span>
)}
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Browser notifications denied | Show guidance message; polling still runs silently |
| Todo completed before reminder fires | `/api/notifications/check` filters `completed = 0`, no notification sent |
| `reminder_minutes` is `undefined` from DB | Always use `todo.reminder_minutes ?? null` in API routes |
| Server clock drift vs client | All checks done server-side using `getSingaporeNow()` |
| Multiple browser tabs open | Each tab polls independently; `last_notification_sent` prevents duplicates |
| `due_date` is `null` | Reminder check skips todos without a due date (`due_date IS NOT NULL`) |
| Reminder set but no due date | Block at UI level — disable reminder dropdown when no due date is set |

---

## 7. Acceptance Criteria

- [ ] "Enable Notifications" button requests browser permission
- [ ] Button state reflects current permission (enabled/blocked/default)
- [ ] User can select a reminder offset when creating or editing a todo
- [ ] Reminder badge shows on todos that have a reminder set
- [ ] Polling runs every 60 seconds when the page is open
- [ ] Browser notification fires when `(due_date - reminder_minutes) <= now`
- [ ] Notification is NOT fired again within 1 hour of the last send
- [ ] Completed todos never trigger notifications
- [ ] Todos without a `due_date` never trigger notifications
- [ ] `last_notification_sent` is updated after each notification sent
- [ ] All time comparisons use Singapore timezone (`getSingaporeNow()`)

---

## 8. Testing Requirements

**Test file**: `tests/05-reminders.spec.ts`

### E2E Test Cases (Playwright)

```typescript
test('enable notification permission', async ({ page }) => {
  await page.click('[data-testid="enable-notifications-btn"]');
  // In test environment, permission is auto-granted
  await expect(page.locator('text=Notifications Enabled')).toBeVisible();
});

test('set reminder on todo', async ({ page }) => {
  await helpers.createTodo(page, 'Meeting prep');
  await page.click('[data-testid="edit-todo-1"]');
  await page.fill('[data-testid="due-date-input"]', '2026-07-10T09:00');
  await page.selectOption('[data-testid="reminder-select"]', '60');
  await page.click('[data-testid="save-todo-btn"]');
  await expect(page.locator('text=1 hour before')).toBeVisible();
});

test('reminder does not show on completed todo', async ({ page }) => {
  await helpers.createTodoWithReminder(page, 'Done task', '2026-07-10T09:00', 15);
  await page.check('[data-testid="todo-checkbox-1"]');
  const res = await page.request.get('/api/notifications/check');
  const data = await res.json();
  expect(data.todos.find((t: any) => t.title === 'Done task')).toBeUndefined();
});
```

### Setup Notes
- Grant notification permission via browser context: `context.grantPermissions(['notifications'])`
- `timezoneId: 'Asia/Singapore'` in Playwright config
- Mock system clock for time-sensitive tests using `page.clock.set()`

---

## 9. Out of Scope

- SMS or email notifications
- Push notifications (service worker / web push)
- Persistent notification history / inbox
- Snooze functionality
- Notification sounds or vibration settings
- Multiple reminders per todo

---

## 10. Success Metrics

- Notification fires within 60 seconds of the reminder window opening
- Zero duplicate notifications within a 1-hour window
- Polling does not cause noticeable performance degradation
- All E2E tests pass with `npx playwright test tests/05-reminders.spec.ts`
- `last_notification_sent` correctly updated in database after each fire
