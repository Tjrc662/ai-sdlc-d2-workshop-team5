import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';

export const loginChallengeStore = new Map<string, string>();

export async function POST(request: NextRequest) {
  const { username } = await request.json();

  if (!username || typeof username !== 'string' || !username.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const cleanUsername = username.trim();
  const user = userDB.findByUsername(cleanUsername);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const authenticators = authenticatorDB.findAllByUserId(user.id);
  const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost';

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials: authenticators.map((auth) => ({
      id: isoBase64URL.toBuffer(auth.credential_id),
      transports: auth.transports
        ? (JSON.parse(auth.transports) as AuthenticatorTransport[])
        : undefined,
    })),
  });

  loginChallengeStore.set(cleanUsername, options.challenge);

  return NextResponse.json(options);
}
