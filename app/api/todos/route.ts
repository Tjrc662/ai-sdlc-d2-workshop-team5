import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, tagDB, subtaskDB } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todos = todoDB.findAllByUserId(session.userId);
  const todosWithMeta = todos.map((todo) => ({
    ...todo,
    tags: tagDB.findByTodoId(todo.id),
    subtasks: subtaskDB.findAllByTodoId(todo.id),
  }));

  return NextResponse.json(todosWithMeta);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const { title, priority, due_date, recurrence_pattern, reminder_minutes, tag_ids } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const todo = todoDB.create({
    user_id: session.userId,
    title: title.trim(),
    priority: priority ?? 'medium',
    due_date: due_date ?? null,
    recurrence_pattern: recurrence_pattern ?? null,
    reminder_minutes: reminder_minutes ?? null,
  });

  if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
    tagDB.replaceForTodo(todo.id, tag_ids);
  }

  return NextResponse.json({
    ...todo,
    tags: tagDB.findByTodoId(todo.id),
    subtasks: [],
  }, { status: 201 });
}
