import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { userDB, authenticatorDB } from '@/lib/db';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

// In-memory challenge store (use Redis in production)
export const challengeStore = new Map<string, string>();

export async function POST(request: NextRequest) {
  const { username } = await request.json();

  if (!username || typeof username !== 'string' || !username.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const cleanUsername = username.trim();
  const existingUser = userDB.findByUsername(cleanUsername);
  if (existingUser) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
  }

  const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost';
  const options = await generateRegistrationOptions({
    rpName: 'Todo App',
    rpID,
    userName: cleanUsername,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  challengeStore.set(cleanUsername, options.challenge);

  return NextResponse.json(options);
}
