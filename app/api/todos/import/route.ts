import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, tagDB, subtaskDB } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let importData;
  try {
    importData = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!importData.todos || !Array.isArray(importData.todos)) {
    return NextResponse.json({ error: 'Invalid import format: missing todos array' }, { status: 400 });
  }

  // Import tags first and build old_id → new_id map
  const tagIdMap = new Map<number, number>();
  if (importData.tags && Array.isArray(importData.tags)) {
    for (const tag of importData.tags) {
      if (!tag.name || !tag.color) continue;
      try {
        const newTag = tagDB.create({
          user_id: session.userId,
          name: tag.name,
          color: tag.color,
        });
        tagIdMap.set(tag.id, newTag.id);
      } catch {
        // Tag name already exists — find existing
        const existingTags = tagDB.findAllByUserId(session.userId);
        const existing = existingTags.find((t) => t.name === tag.name);
        if (existing) tagIdMap.set(tag.id, existing.id);
      }
    }
  }

  let importedCount = 0;
  for (const todo of importData.todos) {
    if (!todo.title) continue;

    const newTodo = todoDB.create({
      user_id: session.userId,
      title: todo.title,
      priority: todo.priority ?? 'medium',
      due_date: todo.due_date ?? null,
      recurrence_pattern: todo.recurrence_pattern ?? null,
      reminder_minutes: todo.reminder_minutes ?? null,
    });

    // Re-map and apply tags
    if (todo.tags && Array.isArray(todo.tags)) {
      const newTagIds = todo.tags
        .map((t: { id: number }) => tagIdMap.get(t.id))
        .filter(Boolean) as number[];
      if (newTagIds.length > 0) tagDB.replaceForTodo(newTodo.id, newTagIds);
    }

    // Import subtasks
    if (todo.subtasks && Array.isArray(todo.subtasks)) {
      for (const sub of todo.subtasks) {
        if (!sub.title) continue;
        subtaskDB.create({ todo_id: newTodo.id, title: sub.title, position: sub.position ?? 0 });
      }
    }

    importedCount++;
  }

  return NextResponse.json({ imported: importedCount });
}
