import { test, expect } from '@playwright/test';

test.describe('Authentication (WebAuthn)', () => {
  test('registers a new user and redirects to home', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('redirects unauthenticated user from / to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('redirects unauthenticated user from /calendar to /login', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page).toHaveURL('/login');
  });

  test('logs in a returning user', async ({ page }) => {
    const username = `login-user-${Date.now()}`;
    // Register
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', username);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');

    // Logout
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL('/login');

    // Login
    await page.fill('input[placeholder="Enter your username"]', username);
    await page.getByRole('button', { name: /Login with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('session persists after page reload', async ({ page }) => {
    const username = `session-user-${Date.now()}`;
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', username);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
    await page.reload();
    await expect(page).toHaveURL('/');
  });

  test('shows error for duplicate username', async ({ page }) => {
    const username = `dup-${Date.now()}`;
    // Register once
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', username);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');

    // Logout and try to register same name
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', username);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page.locator('.bg-red-50')).toBeVisible();
  });
});
