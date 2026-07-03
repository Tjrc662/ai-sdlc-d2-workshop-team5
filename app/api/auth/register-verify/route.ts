import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { challengeStore } from '../register-options/route';

export async function POST(request: NextRequest) {
  const { username, credential } = await request.json();

  if (!username || !credential) {
    return NextResponse.json({ error: 'Missing username or credential' }, { status: 400 });
  }

  const cleanUsername = username.trim();
  const expectedChallenge = challengeStore.get(cleanUsername);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'No pending registration — please restart' }, { status: 400 });
  }

  const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost';
  const origin = process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000';

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 400 }
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Registration verification failed' }, { status: 400 });
  }

  challengeStore.delete(cleanUsername);

  const { credential: cred } = verification.registrationInfo;

  const user = userDB.create(cleanUsername);
  authenticatorDB.create({
    user_id: user.id,
    credential_id: isoBase64URL.fromBuffer(cred.id),
    public_key: isoBase64URL.fromBuffer(cred.publicKey),
    counter: cred.counter ?? 0,
    transports: credential.response?.transports
      ? JSON.stringify(credential.response.transports)
      : null,
  });

  await createSession({ userId: user.id, username: user.username });

  return NextResponse.json({ verified: true });
}
