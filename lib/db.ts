import Database from 'better-sqlite3';
import path from 'path';
import { getSingaporeNow } from './timezone';

const DB_PATH = path.join(process.cwd(), 'todos.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS authenticators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    last_notification_sent TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    created_at TEXT NOT NULL,
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    subtasks TEXT NOT NULL DEFAULT '[]',
    due_date_offset INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
  );
`);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  created_at: string;
}

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: number;
  priority: Priority;
  due_date: string | null;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: number;
  position: number;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  title: string;
  priority: Priority;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  subtasks: string; // JSON string: [{title, position}]
  due_date_offset: number | null;
  created_at: string;
}

export interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
}

// ─── User DB ──────────────────────────────────────────────────────────────────

export const userDB = {
  create(username: string): User {
    const now = getSingaporeNow().toISOString();
    const result = db
      .prepare('INSERT INTO users (username, created_at) VALUES (?, ?)')
      .run(username, now);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
  },

  findByUsername(username: string): User | undefined {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  },

  findById(id: number): User | undefined {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  },
};

// ─── Authenticator DB ─────────────────────────────────────────────────────────

export const authenticatorDB = {
  create(data: Omit<Authenticator, 'id' | 'created_at'>): Authenticator {
    const now = getSingaporeNow().toISOString();
    const result = db
      .prepare(
        `INSERT INTO authenticators (user_id, credential_id, public_key, counter, transports, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(data.user_id, data.credential_id, data.public_key, data.counter ?? 0, data.transports, now);
    return db.prepare('SELECT * FROM authenticators WHERE id = ?').get(result.lastInsertRowid) as Authenticator;
  },

  findByCredentialId(credentialId: string): Authenticator | undefined {
    return db
      .prepare('SELECT * FROM authenticators WHERE credential_id = ?')
      .get(credentialId) as Authenticator | undefined;
  },

  findAllByUserId(userId: number): Authenticator[] {
    return db
      .prepare('SELECT * FROM authenticators WHERE user_id = ?')
      .all(userId) as Authenticator[];
  },

  updateCounter(credentialId: string, counter: number): void {
    db.prepare('UPDATE authenticators SET counter = ? WHERE credential_id = ?').run(counter ?? 0, credentialId);
  },
};

// ─── Todo DB ──────────────────────────────────────────────────────────────────

export const todoDB = {
  create(data: {
    user_id: number;
    title: string;
    priority?: Priority;
    due_date?: string | null;
    recurrence_pattern?: RecurrencePattern | null;
    reminder_minutes?: number | null;
  }): Todo {
    const now = getSingaporeNow().toISOString();
    const result = db
      .prepare(
        `INSERT INTO todos (user_id, title, completed, priority, due_date, recurrence_pattern, reminder_minutes, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.user_id,
        data.title,
        data.priority ?? 'medium',
        data.due_date ?? null,
        data.recurrence_pattern ?? null,
        data.reminder_minutes ?? null,
        now,
        now
      );
    return db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid) as Todo;
  },

  findAllByUserId(userId: number): Todo[] {
    return db
      .prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Todo[];
  },

  findById(id: number): Todo | undefined {
    return db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo | undefined;
  },

  update(
    id: number,
    data: Partial<Pick<Todo, 'title' | 'completed' | 'priority' | 'due_date' | 'recurrence_pattern' | 'reminder_minutes' | 'last_notification_sent'>>
  ): Todo | undefined {
    const now = getSingaporeNow().toISOString();
    const fields = Object.keys(data)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(data);
    db.prepare(`UPDATE todos SET ${fields}, updated_at = ? WHERE id = ?`).run(...values, now, id);
    return db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo | undefined;
  },

  delete(id: number): void {
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  },

  findByMonthAndUser(userId: number, year: number, month: number): Todo[] {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;
    return db
      .prepare(
        `SELECT * FROM todos WHERE user_id = ? AND due_date >= ? AND due_date <= ? ORDER BY due_date ASC`
      )
      .all(userId, start, end) as Todo[];
  },

  findDueReminders(userId: number): Todo[] {
    return db
      .prepare(
        `SELECT * FROM todos WHERE user_id = ? AND completed = 0 AND reminder_minutes IS NOT NULL AND due_date IS NOT NULL`
      )
      .all(userId) as Todo[];
  },
};

// ─── Subtask DB ───────────────────────────────────────────────────────────────

export const subtaskDB = {
  create(data: { todo_id: number; title: string; position?: number }): Subtask {
    const now = getSingaporeNow().toISOString();
    const position = data.position ?? 0;
    const result = db
      .prepare(
        'INSERT INTO subtasks (todo_id, title, completed, position, created_at) VALUES (?, ?, 0, ?, ?)'
      )
      .run(data.todo_id, data.title, position, now);
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid) as Subtask;
  },

  findAllByTodoId(todoId: number): Subtask[] {
    return db
      .prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC')
      .all(todoId) as Subtask[];
  },

  findById(id: number): Subtask | undefined {
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as Subtask | undefined;
  },

  update(id: number, data: Partial<Pick<Subtask, 'title' | 'completed' | 'position'>>): Subtask | undefined {
    const fields = Object.keys(data)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(data);
    db.prepare(`UPDATE subtasks SET ${fields} WHERE id = ?`).run(...values, id);
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as Subtask | undefined;
  },

  delete(id: number): void {
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  },
};

// ─── Tag DB ───────────────────────────────────────────────────────────────────

export const tagDB = {
  create(data: { user_id: number; name: string; color: string }): Tag {
    const now = getSingaporeNow().toISOString();
    const result = db
      .prepare('INSERT INTO tags (user_id, name, color, created_at) VALUES (?, ?, ?, ?)')
      .run(data.user_id, data.name, data.color, now);
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as Tag;
  },

  findAllByUserId(userId: number): Tag[] {
    return db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC').all(userId) as Tag[];
  },

  findById(id: number): Tag | undefined {
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
  },

  delete(id: number): void {
    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  },

  addToTodo(todoId: number, tagId: number): void {
    db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todoId, tagId);
  },

  removeFromTodo(todoId: number, tagId: number): void {
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?').run(todoId, tagId);
  },

  findByTodoId(todoId: number): Tag[] {
    return db
      .prepare(
        `SELECT t.* FROM tags t
         INNER JOIN todo_tags tt ON tt.tag_id = t.id
         WHERE tt.todo_id = ?
         ORDER BY t.name ASC`
      )
      .all(todoId) as Tag[];
  },

  replaceForTodo(todoId: number, tagIds: number[]): void {
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todoId);
    const insert = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
    for (const tagId of tagIds) {
      insert.run(todoId, tagId);
    }
  },
};

// ─── Template DB ──────────────────────────────────────────────────────────────

export const templateDB = {
  create(data: Omit<Template, 'id' | 'created_at'>): Template {
    const now = getSingaporeNow().toISOString();
    const result = db
      .prepare(
        `INSERT INTO templates (user_id, name, title, priority, recurrence_pattern, reminder_minutes, subtasks, due_date_offset, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.user_id,
        data.name,
        data.title,
        data.priority,
        data.recurrence_pattern ?? null,
        data.reminder_minutes ?? null,
        data.subtasks,
        data.due_date_offset ?? null,
        now
      );
    return db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid) as Template;
  },

  findAllByUserId(userId: number): Template[] {
    return db
      .prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY name ASC')
      .all(userId) as Template[];
  },

  findById(id: number): Template | undefined {
    return db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as Template | undefined;
  },

  delete(id: number): void {
    db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  },
};

// ─── Holiday DB ───────────────────────────────────────────────────────────────

export const holidayDB = {
  upsert(date: string, name: string): void {
    db.prepare('INSERT OR REPLACE INTO holidays (date, name) VALUES (?, ?)').run(date, name);
  },

  findByMonth(year: number, month: number): Holiday[] {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return db
      .prepare("SELECT * FROM holidays WHERE date LIKE ? ORDER BY date ASC")
      .all(`${prefix}-%`) as Holiday[];
  },

  findAll(): Holiday[] {
    return db.prepare('SELECT * FROM holidays ORDER BY date ASC').all() as Holiday[];
  },
};

export default db;
