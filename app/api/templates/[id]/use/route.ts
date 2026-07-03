import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB, todoDB, subtaskDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id));
  if (!template || template.user_id !== session.userId) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Calculate due date from offset (days from today)
  let due_date: string | null = null;
  if (template.due_date_offset !== null) {
    const d = getSingaporeNow();
    d.setDate(d.getDate() + template.due_date_offset);
    due_date = d.toISOString();
  }

  const todo = todoDB.create({
    user_id: session.userId,
    title: template.title,
    priority: template.priority,
    due_date,
    recurrence_pattern: template.recurrence_pattern ?? null,
    reminder_minutes: template.reminder_minutes ?? null,
  });

  // Create subtasks from JSON
  const subtaskDefs: { title: string; position: number }[] = JSON.parse(template.subtasks || '[]');
  for (const sub of subtaskDefs) {
    subtaskDB.create({ todo_id: todo.id, title: sub.title, position: sub.position });
  }

  return NextResponse.json({
    ...todo,
    subtasks: subtaskDB.findAllByTodoId(todo.id),
    tags: [],
  }, { status: 201 });
}
