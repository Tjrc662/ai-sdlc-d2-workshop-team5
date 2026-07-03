import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { shouldSendReminder } from '@/lib/timezone';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todos = todoDB.findDueReminders(session.userId);
  const due: { id: number; title: string; due_date: string }[] = [];

  for (const todo of todos) {
    if (!todo.due_date || !todo.reminder_minutes) continue;

    if (shouldSendReminder(todo.due_date, todo.reminder_minutes, todo.last_notification_sent)) {
      due.push({ id: todo.id, title: todo.title, due_date: todo.due_date });

      // Mark notification as sent
      todoDB.update(todo.id, { last_notification_sent: new Date().toISOString() });
    }
  }

  return NextResponse.json({ due });
}
