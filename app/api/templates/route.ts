import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  return NextResponse.json(templateDB.findAllByUserId(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { name, title, priority, recurrence_pattern, reminder_minutes, subtasks, due_date_offset } =
    await request.json();

  if (!name || !title) {
    return NextResponse.json({ error: 'Name and title are required' }, { status: 400 });
  }

  const template = templateDB.create({
    user_id: session.userId,
    name: name.trim(),
    title: title.trim(),
    priority: priority ?? 'medium',
    recurrence_pattern: recurrence_pattern ?? null,
    reminder_minutes: reminder_minutes ?? null,
    subtasks: JSON.stringify(Array.isArray(subtasks) ? subtasks : []),
    due_date_offset: due_date_offset ?? null,
  });

  return NextResponse.json(template, { status: 201 });
}
