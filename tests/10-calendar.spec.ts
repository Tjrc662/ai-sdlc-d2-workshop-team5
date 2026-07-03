import { test, expect } from '@playwright/test';

test.describe('Calendar View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `cal-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('navigates to calendar page', async ({ page }) => {
    await page.getByRole('link', { name: '📅 Calendar' }).click();
    await expect(page).toHaveURL('/calendar');
    await expect(page.locator('h1:has-text("Calendar")')).toBeVisible();
  });

  test('displays current month and year', async ({ page }) => {
    await page.goto('/calendar');
    const now = new Date();
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    await expect(
      page.locator(`text=${months[now.getMonth()]} ${now.getFullYear()}`)
    ).toBeVisible();
  });

  test('navigates to previous month', async ({ page }) => {
    await page.goto('/calendar');
    await page.getByRole('button', { name: '◀ Prev' }).click();
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    await expect(
      page.locator(`text=${months[now.getMonth()]} ${now.getFullYear()}`)
    ).toBeVisible();
  });

  test('navigates to next month', async ({ page }) => {
    await page.goto('/calendar');
    await page.getByRole('button', { name: 'Next ▶' }).click();
    const now = new Date();
    now.setMonth(now.getMonth() + 1);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    await expect(
      page.locator(`text=${months[now.getMonth()]} ${now.getFullYear()}`)
    ).toBeVisible();
  });

  test('shows todo with due date on correct calendar cell', async ({ page }) => {
    // Create a todo with today's due date
    const today = new Date();
    const isoStr = today.toISOString().slice(0, 16);
    await page.fill('input[placeholder="What needs to be done?"]', 'Calendar task');
    await page.fill('input[type="datetime-local"]', isoStr);
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    // Go to calendar
    await page.goto('/calendar');
    await expect(page.locator('text=Calendar task')).toBeVisible();
  });
});
