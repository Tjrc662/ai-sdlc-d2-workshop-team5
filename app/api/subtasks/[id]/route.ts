import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB, todoDB } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const subtask = subtaskDB.findById(Number(id));
  if (!subtask) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  // Verify ownership via parent todo
  const todo = todoDB.findById(subtask.todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { title, completed, position } = await request.json();
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (completed !== undefined) updates.completed = completed ? 1 : 0;
  if (position !== undefined) updates.position = position;

  const updated = subtaskDB.update(subtask.id, updates as Parameters<typeof subtaskDB.update>[1]);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const subtask = subtaskDB.findById(Number(id));
  if (!subtask) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });

  const todo = todoDB.findById(subtask.todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  subtaskDB.delete(subtask.id);
  return NextResponse.json({ success: true });
}
