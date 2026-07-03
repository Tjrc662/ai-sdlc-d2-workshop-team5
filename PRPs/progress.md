# Todo App — Implementation Progress

## PRP Generation Status

| # | PRP File | Status |
|---|---|---|
| 01 | [Todo CRUD Operations](./01-todo-crud-operations.md) | ✅ Generated |
| 02 | [Priority System](./02-priority-system.md) | ✅ Generated |
| 03 | [Recurring Todos](./03-recurring-todos.md) | ✅ Generated |
| 04 | [Reminders & Notifications](./04-reminders-notifications.md) | ✅ Generated |
| 05 | [Subtasks & Progress](./05-subtasks-progress.md) | ✅ Generated |
| 06 | [Tag System](./06-tag-system.md) | ✅ Generated |
| 07 | [Template System](./07-template-system.md) | ✅ Generated |
| 08 | [Search & Filtering](./08-search-filtering.md) | ✅ Generated |
| 09 | [Export & Import](./09-export-import.md) | ✅ Generated |
| 10 | [Calendar View](./10-calendar-view.md) | ✅ Generated |
| 11 | [WebAuthn Authentication](./11-authentication-webauthn.md) | ✅ Generated |

---

## Implementation Status

### Phase 1 — Foundation
| Feature | Files | Status |
|---|---|---|
| Project scaffold | `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts` | ✅ Done |
| Timezone utility | `lib/timezone.ts` | ✅ Done |
| Auth utility | `lib/auth.ts` | ✅ Done |
| Database layer | `lib/db.ts` | ✅ Done |
| Middleware | `middleware.ts` | ✅ Done |
| Todo CRUD (PRP 01) | `app/api/todos/route.ts`, `app/api/todos/[id]/route.ts` | ✅ Done |
| Priority System (PRP 02) | Integrated into todos DB + API + UI | ✅ Done |

### Phase 2 — Core Features
| Feature | Files | Status |
|---|---|---|
| Recurring Todos (PRP 03) | `app/api/todos/[id]/route.ts` PUT handler | ✅ Done |
| Reminders & Notifications (PRP 04) | `app/api/notifications/check/route.ts`, `lib/hooks/useNotifications.ts` | ✅ Done |
| Subtasks & Progress (PRP 05) | `app/api/todos/[id]/subtasks/route.ts`, `app/api/subtasks/[id]/route.ts` | ✅ Done |

### Phase 3 — Organisation
| Feature | Files | Status |
|---|---|---|
| Tag System (PRP 06) | `app/api/tags/route.ts`, `app/api/tags/[id]/route.ts`, `app/api/todos/[id]/tags/route.ts` | ✅ Done |
| Search & Filtering (PRP 08) | `app/page.tsx` (client-side filtering) | ✅ Done |

### Phase 4 — Productivity
| Feature | Files | Status |
|---|---|---|
| Template System (PRP 07) | `app/api/templates/route.ts`, `app/api/templates/[id]/route.ts`, `app/api/templates/[id]/use/route.ts` | ✅ Done |
| Export & Import (PRP 09) | `app/api/todos/export/route.ts`, `app/api/todos/import/route.ts` | ✅ Done |
| Calendar View (PRP 10) | `app/calendar/page.tsx`, `scripts/seed-holidays.ts` | ✅ Done |

### Phase 5 — Infrastructure
| Feature | Files | Status |
|---|---|---|
| WebAuthn Auth (PRP 11) | `app/api/auth/*/route.ts`, `app/login/page.tsx` | ✅ Done |

### Testing
| Test File | Feature | Status |
|---|---|---|
| `tests/01-authentication.spec.ts` | WebAuthn register/login | ✅ Done |
| `tests/02-todo-crud.spec.ts` | CRUD + priority | ✅ Done |
| `tests/03-recurring-todos.spec.ts` | Recurring completion | ✅ Done |
| `tests/04-reminders.spec.ts` | Browser notifications | ✅ Done |
| `tests/05-subtasks.spec.ts` | Subtasks + progress | ✅ Done |
| `tests/06-tags.spec.ts` | Tag CRUD + filtering | ✅ Done |
| `tests/07-templates.spec.ts` | Template save + use | ✅ Done |
| `tests/08-search-filtering.spec.ts` | Search + filters | ✅ Done |
| `tests/09-export-import.spec.ts` | JSON export/import | ✅ Done |
| `tests/10-calendar.spec.ts` | Calendar view + holidays | ✅ Done |

---

## Commands

```bash
npm install               # Install dependencies
npm run dev               # Start dev server on :3000
npm run build             # Production build
npm run lint              # ESLint check

npx tsx scripts/seed-holidays.ts   # Seed Singapore public holidays
sqlite3 todos.db                   # Inspect database

npx playwright test                # Run all E2E tests
npx playwright test --ui           # Interactive test runner
npx playwright show-report         # View HTML report
```

---

_Last updated: 2026-07-03_
