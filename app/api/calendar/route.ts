import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, holidayDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get('month'); // format: YYYY-MM

  let year: number;
  let month: number;

  if (monthParam) {
    const [y, m] = monthParam.split('-').map(Number);
    year = y;
    month = m;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const todos = todoDB.findByMonthAndUser(session.userId, year, month);
  const holidays = holidayDB.findByMonth(year, month);

  return NextResponse.json({ todos, holidays });
}
