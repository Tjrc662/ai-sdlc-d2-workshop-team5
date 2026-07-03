import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, tagDB, subtaskDB } from '@/lib/db';
import { getNextDueDate } from '@/lib/timezone';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id));
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...todo,
    tags: tagDB.findByTodoId(todo.id),
    subtasks: subtaskDB.findAllByTodoId(todo.id),
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id));
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const { title, completed, priority, due_date, recurrence_pattern, reminder_minutes, tag_ids } = body;

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (priority !== undefined) updates.priority = priority;
  if (due_date !== undefined) updates.due_date = due_date;
  if (recurrence_pattern !== undefined) updates.recurrence_pattern = recurrence_pattern;
  if (reminder_minutes !== undefined) updates.reminder_minutes = reminder_minutes ?? null;
  if (completed !== undefined) updates.completed = completed ? 1 : 0;

  const updated = todoDB.update(todo.id, updates as Parameters<typeof todoDB.update>[1]);

  // Handle tag updates
  if (tag_ids !== undefined && Array.isArray(tag_ids)) {
    tagDB.replaceForTodo(todo.id, tag_ids);
  }

  // Recurring todo: when completing, create next instance
  if (completed && !todo.completed && todo.recurrence_pattern && todo.due_date) {
    const nextDueDate = getNextDueDate(todo.due_date, todo.recurrence_pattern);
    const existingTags = tagDB.findByTodoId(todo.id);

    const nextTodo = todoDB.create({
      user_id: session.userId,
      title: todo.title,
      priority: todo.priority,
      due_date: nextDueDate,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes ?? null,
    });

    if (existingTags.length > 0) {
      tagDB.replaceForTodo(nextTodo.id, existingTags.map((t) => t.id));
    }
  }

  return NextResponse.json({
    ...updated,
    tags: tagDB.findByTodoId(todo.id),
    subtasks: subtaskDB.findAllByTodoId(todo.id),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id));
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  todoDB.delete(todo.id);
  return NextResponse.json({ success: true });
}
