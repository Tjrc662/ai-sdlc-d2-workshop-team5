import { test, expect } from '@playwright/test';

test.describe('Recurring Todos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `recur-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('creates a recurring daily todo', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Daily standup');
    await page.locator('select:has-text("No repeat")').selectOption('daily');
    // Set a due date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isoStr = tomorrow.toISOString().slice(0, 16);
    await page.fill('input[type="datetime-local"]', isoStr);
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await expect(page.locator('text=Daily standup').first()).toBeVisible();
    await expect(page.locator('text=↻ daily').first()).toBeVisible();
  });

  test('completing recurring todo creates next instance', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Weekly review');
    await page.locator('select:has-text("No repeat")').selectOption('weekly');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.fill('input[type="datetime-local"]', tomorrow.toISOString().slice(0, 16));
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    // Complete the todo
    await page.locator('input[type="checkbox"]').first().click();

    // Should now have 2 instances (completed + new)
    await expect(page.locator('text=Weekly review')).toHaveCount(2);
  });
});
