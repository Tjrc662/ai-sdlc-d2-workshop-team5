import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { userDB, authenticatorDB } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { loginChallengeStore } from '../login-options/route';

export async function POST(request: NextRequest) {
  const { username, assertion } = await request.json();

  if (!username || !assertion) {
    return NextResponse.json({ error: 'Missing username or assertion' }, { status: 400 });
  }

  const cleanUsername = username.trim();
  const user = userDB.findByUsername(cleanUsername);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const expectedChallenge = loginChallengeStore.get(cleanUsername);
  if (!expectedChallenge) {
    return NextResponse.json({ error: 'No pending login — please restart' }, { status: 400 });
  }

  const credentialId = assertion.id;
  const authenticator = authenticatorDB.findByCredentialId(credentialId);
  if (!authenticator) {
    return NextResponse.json({ error: 'Authenticator not found' }, { status: 400 });
  }

  const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost';
  const origin = process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000';

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: isoBase64URL.toBuffer(authenticator.credential_id),
        publicKey: isoBase64URL.toBuffer(authenticator.public_key),
        counter: authenticator.counter ?? 0,
        transports: authenticator.transports
          ? (JSON.parse(authenticator.transports) as AuthenticatorTransport[])
          : undefined,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 400 }
    );
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Authentication verification failed' }, { status: 400 });
  }

  loginChallengeStore.delete(cleanUsername);
  authenticatorDB.updateCounter(
    authenticator.credential_id,
    verification.authenticationInfo.newCounter ?? 0
  );

  await createSession({ userId: user.id, username: user.username });

  return NextResponse.json({ verified: true });
}
