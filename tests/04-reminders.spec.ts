import { test, expect } from '@playwright/test';

test.describe('Reminders & Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `reminder-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('creates a todo with a reminder', async ({ page }) => {
    const future = new Date();
    future.setHours(future.getHours() + 2);
    await page.fill('input[placeholder="What needs to be done?"]', 'Remind me task');
    await page.fill('input[type="datetime-local"]', future.toISOString().slice(0, 16));
    await page.locator('select:has-text("No reminder")').selectOption('60');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await expect(page.locator('text=Remind me task')).toBeVisible();
    await expect(page.locator('text=1 hour before')).toBeVisible();
  });

  test('/api/notifications/check returns due array', async ({ page }) => {
    const res = await page.request.get('/api/notifications/check');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('due');
    expect(Array.isArray(json.due)).toBe(true);
  });
});
