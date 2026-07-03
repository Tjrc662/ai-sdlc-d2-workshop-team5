import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, tagDB, subtaskDB } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todos = todoDB.findAllByUserId(session.userId);
  const tags = tagDB.findAllByUserId(session.userId);

  const exportData = {
    exported_at: new Date().toISOString(),
    todos: todos.map((todo) => ({
      ...todo,
      subtasks: subtaskDB.findAllByTodoId(todo.id),
      tags: tagDB.findByTodoId(todo.id),
    })),
    tags,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="todos-export.json"',
    },
  });
}
