import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  return NextResponse.json(tagDB.findAllByUserId(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { name, color } = await request.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
  }

  try {
    const tag = tagDB.create({
      user_id: session.userId,
      name: name.trim(),
      color: color ?? '#3B82F6',
    });
    return NextResponse.json(tag, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
  }
}
