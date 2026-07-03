import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const tag = tagDB.findById(Number(id));
  if (!tag || tag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  tagDB.delete(tag.id);
  return NextResponse.json({ success: true });
}
