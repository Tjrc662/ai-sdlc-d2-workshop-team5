# PRP 11 - WebAuthn / Passkeys Authentication

## 1. Feature Overview

The authentication system uses **WebAuthn/Passkeys** — a passwordless, biometric-based standard — to register and authenticate users. There are no passwords at all. Sessions are managed via JWT tokens stored in HTTP-only cookies (7-day expiry). Route protection is enforced by Next.js middleware. This infrastructure feature can be developed in parallel with others and wired in last, but is required in production so all API routes can use `session.userId`.

---

## 2. User Stories

- **As a new user**, I want to register with just a username and my device biometric (fingerprint / Face ID / PIN) so I never need to remember a password.
- **As a returning user**, I want to log in with my passkey so access is fast and secure.
- **As a user**, I want my session to persist for 7 days without re-authenticating so I stay productive.
- **As a user**, I want to be redirected to the login page if my session expires so I know to re-authenticate.
- **As a developer**, I want all API routes to reject unauthenticated requests with a 401 so data is protected.

---

## 3. User Flow

### Registration
1. User navigates to `/login`
2. Enters a unique username
3. Clicks **Register**
4. Client calls `POST /api/auth/register-options` → receives WebAuthn challenge
5. Browser invokes `startRegistration()` from `@simplewebauthn/browser` → shows native biometric prompt
6. Client posts credential response to `POST /api/auth/register-verify`
7. Server verifies with `@simplewebauthn/server`, stores user + authenticator in DB
8. Server creates JWT session cookie (HTTP-only, 7-day expiry)
9. Client redirected to `/` (main todo page)

### Login
1. User navigates to `/login`
2. Enters their username
3. Clicks **Login**
4. Client calls `POST /api/auth/login-options` → receives WebAuthn challenge
5. Browser invokes `startAuthentication()` from `@simplewebauthn/browser`
6. Client posts assertion response to `POST /api/auth/login-verify`
7. Server verifies assertion, updates authenticator counter, renews JWT cookie
8. Client redirected to `/`

### Logout
1. User clicks **Logout**
2. Client calls `POST /api/auth/logout`
3. Server clears session cookie
4. Client redirected to `/login`

### Protected Route Access
1. User navigates to `/` or `/calendar`
2. `middleware.ts` checks for valid JWT cookie via `getSession()`
3. If no valid session → redirect to `/login`
4. If valid → request proceeds normally

---

## 4. Technical Requirements

### Database Schema (`lib/db.ts`)

```typescript
// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// Authenticators table (one user can have multiple passkeys)
db.exec(`
  CREATE TABLE IF NOT EXISTS authenticators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    created_at TEXT NOT NULL
  )
`);
```

### TypeScript Interfaces (in `lib/db.ts`)

```typescript
export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;   // base64url encoded
  public_key: string;      // base64url encoded
  counter: number;
  transports: string | null; // JSON array string e.g. '["internal"]'
  created_at: string;
}
```

### Database Operations (`lib/db.ts`)

```typescript
export const userDB = {
  create: (username: string): User => {
    const stmt = db.prepare(
      `INSERT INTO users (username, created_at) VALUES (?, ?)`
    );
    const now = getSingaporeNow().toISOString();
    const result = stmt.run(username, now);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
  },
  findByUsername: (username: string): User | undefined => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  },
  findById: (id: number): User | undefined => {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  },
};

export const authenticatorDB = {
  create: (data: Omit<Authenticator, 'id' | 'created_at'>): Authenticator => {
    const stmt = db.prepare(`
      INSERT INTO authenticators (user_id, credential_id, public_key, counter, transports, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = getSingaporeNow().toISOString();
    const result = stmt.run(data.user_id, data.credential_id, data.public_key, data.counter ?? 0, data.transports, now);
    return db.prepare('SELECT * FROM authenticators WHERE id = ?').get(result.lastInsertRowid) as Authenticator;
  },
  findByCredentialId: (credentialId: string): Authenticator | undefined => {
    return db.prepare('SELECT * FROM authenticators WHERE credential_id = ?').get(credentialId) as Authenticator | undefined;
  },
  findAllByUserId: (userId: number): Authenticator[] => {
    return db.prepare('SELECT * FROM authenticators WHERE user_id = ?').all(userId) as Authenticator[];
  },
  updateCounter: (credentialId: string, counter: number): void => {
    db.prepare('UPDATE authenticators SET counter = ? WHERE credential_id = ?').run(counter ?? 0, credentialId);
  },
};
```

### Session Management (`lib/auth.ts`)

```typescript
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const COOKIE_NAME = 'session';
const EXPIRY_DAYS = 7;

export interface SessionPayload {
  userId: number;
  username: string;
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${EXPIRY_DAYS}d` });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: EXPIRY_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
```

### Middleware (`middleware.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/calendar'],
};
```

### API Routes

#### `app/api/auth/register-options/route.ts`
```typescript
// POST — generate WebAuthn registration challenge
export async function POST(request: NextRequest) {
  const { username } = await request.json();
  // Validate username, check not already taken
  // Generate registration options with generateRegistrationOptions()
  // Store challenge in session/cache temporarily
  // Return options to client
}
```

#### `app/api/auth/register-verify/route.ts`
```typescript
// POST — verify registration credential and create user
export async function POST(request: NextRequest) {
  // Retrieve stored challenge
  // verifyRegistrationResponse() from @simplewebauthn/server
  // Store user + authenticator in DB (counter: ?? 0)
  // Use isoBase64URL.fromBuffer() for credential_id storage
  // createSession() and return success
}
```

#### `app/api/auth/login-options/route.ts`
```typescript
// POST — generate WebAuthn authentication challenge
export async function POST(request: NextRequest) {
  // Find user by username
  // Get all authenticators for user
  // generateAuthenticationOptions() with existing credentials
  // Store challenge temporarily
  // Return options to client
}
```

#### `app/api/auth/login-verify/route.ts`
```typescript
// POST — verify authentication assertion
export async function POST(request: NextRequest) {
  // Retrieve stored challenge
  // Find authenticator by credential_id
  // verifyAuthenticationResponse() from @simplewebauthn/server
  // CRITICAL: counter: authenticator.counter ?? 0
  // authenticatorDB.updateCounter(credentialId, verification.authenticationInfo.newCounter)
  // createSession() and return success
}
```

#### `app/api/auth/logout/route.ts`
```typescript
export async function POST() {
  await clearSession();
  return NextResponse.json({ success: true });
}
```

#### `app/api/auth/session/route.ts`
```typescript
// GET — return current session user info (for client-side auth state)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ userId: session.userId, username: session.username });
}
```

### RP (Relying Party) Configuration

```typescript
// Set in register/login options generation
const rpName = 'Todo App';
const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost';
const origin = process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000';
```

---

## 5. UI Components

The login page lives at `app/login/page.tsx` as a `'use client'` component. It is **not** protected by middleware.

```tsx
// app/login/page.tsx
'use client';

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setLoading(true);
    setError('');
    try {
      // 1. Get options
      const optRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error);

      // 2. Browser WebAuthn prompt
      const credential = await startRegistration(options);

      // 3. Verify
      const verifyRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, credential }),
      });
      const result = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(result.error);

      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setLoading(true);
    setError('');
    try {
      const optRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error);

      const assertion = await startAuthentication(options);

      const verifyRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, assertion }),
      });
      const result = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(result.error);

      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Todo App</h1>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-4"
        />
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleRegister}
            disabled={loading || !username.trim()}
            className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Register
          </button>
          <button
            onClick={handleLogin}
            disabled={loading || !username.trim()}
            className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Username already taken | `register-options` returns 409 Conflict with descriptive error |
| Username not found on login | `login-options` returns 404; do not reveal whether username exists |
| WebAuthn cancelled by user | `startRegistration`/`startAuthentication` throws; catch and show friendly message |
| Expired or tampered JWT | `getSession()` returns `null`; middleware redirects to `/login` |
| Authenticator counter mismatch | Always use `counter: authenticator.counter ?? 0` to avoid `undefined` errors |
| Multiple passkeys per user | `findAllByUserId` returns all authenticators; `allowCredentials` lists all on login-options |
| Non-HTTPS in production | WebAuthn requires HTTPS (or `localhost`); set `rpID` and `origin` env vars correctly |
| Missing `transports` field | Store as `null`; omit from `allowCredentials` if null |
| Credential ID encoding | Use `isoBase64URL.fromBuffer()` from `@simplewebauthn/server/helpers` for storage |

---

## 7. Acceptance Criteria

- [ ] New user can register with a username via WebAuthn biometric prompt
- [ ] Registered user can log in with the same passkey
- [ ] After login, JWT session cookie is set (HTTP-only, 7-day expiry)
- [ ] Visiting `/` or `/calendar` without a session redirects to `/login`
- [ ] After logout, session cookie is cleared and user is redirected to `/login`
- [ ] Duplicate username registration returns an error message
- [ ] Invalid username on login returns an error message
- [ ] All API routes return 401 if called without a valid session
- [ ] Authenticator counter is updated after each successful login
- [ ] `counter: authenticator.counter ?? 0` is used in login-verify to prevent crashes
- [ ] Session persists across page reloads for 7 days

---

## 8. Testing Requirements

**Test file**: `tests/01-authentication.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

// Virtual authenticator is configured in playwright.config.ts with:
// args: ['--enable-features=WebAuthenticationVirtualAuthenticator']

test.describe('WebAuthn Authentication', () => {
  test('registers a new user with passkey', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder="Username"]', 'testuser');
    await page.click('button:has-text("Register")');
    // Virtual authenticator auto-approves
    await expect(page).toHaveURL('/');
  });

  test('logs in returning user with passkey', async ({ page }) => {
    // Register first
    await page.goto('/login');
    await page.fill('input[placeholder="Username"]', 'testuser2');
    await page.click('button:has-text("Register")');
    await expect(page).toHaveURL('/');

    // Logout
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL('/login');

    // Login
    await page.fill('input[placeholder="Username"]', 'testuser2');
    await page.click('button:has-text("Login")');
    await expect(page).toHaveURL('/');
  });

  test('redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('session persists after page reload', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder="Username"]', 'testuser3');
    await page.click('button:has-text("Register")');
    await expect(page).toHaveURL('/');

    await page.reload();
    await expect(page).toHaveURL('/');
  });

  test('shows error for duplicate username', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder="Username"]', 'duplicate');
    await page.click('button:has-text("Register")');
    await expect(page).toHaveURL('/');

    // Logout and try to register same username again
    await page.click('button:has-text("Logout")');
    await page.fill('input[placeholder="Username"]', 'duplicate');
    await page.click('button:has-text("Register")');
    await expect(page.locator('.text-red-500')).toBeVisible();
  });
});
```

**Playwright config requirements** (`playwright.config.ts`):
```typescript
use: {
  timezoneId: 'Asia/Singapore',
  launchOptions: {
    args: [
      '--enable-features=WebAuthenticationVirtualAuthenticator',
    ],
  },
},
```

---

## 9. Out of Scope

- Email-based account recovery
- OAuth / social login (Google, GitHub, etc.)
- Two-factor authentication (WebAuthn IS the second factor)
- User profile editing or avatar upload
- Admin roles or permissions
- Multiple device management UI (listing/removing passkeys)
- Password fallback of any kind
- Rate limiting on auth endpoints (can be added separately)

---

## 10. Success Metrics

- Zero password fields anywhere in the application
- Registration completes in under 3 seconds (biometric prompt + DB write)
- Login completes in under 2 seconds
- Session cookie marked `httpOnly` — not readable by JavaScript
- `middleware.ts` redirects unauthenticated requests with 0 DB queries
- All 5 auth-related Playwright tests pass in CI
- `getSession()` called at the top of every non-auth API route (code review gate)
- No `new Date()` calls in auth code — all timestamps use `getSingaporeNow()`
