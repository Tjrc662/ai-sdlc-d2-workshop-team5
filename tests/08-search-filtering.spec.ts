import { test, expect } from '@playwright/test';

test.describe('Search & Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `search-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');

    // Create test todos
    for (const title of ['Meeting with team', 'Buy groceries', 'Read book']) {
      await page.fill('input[placeholder="What needs to be done?"]', title);
      await page.getByRole('button', { name: '+ Add Todo' }).click();
    }
  });

  test('searches todos by title', async ({ page }) => {
    await page.fill('input[placeholder="Search todos…"]', 'meeting');
    await expect(page.locator('text=Meeting with team')).toBeVisible();
    await expect(page.locator('text=Buy groceries')).not.toBeVisible();
    await expect(page.locator('text=Read book')).not.toBeVisible();
  });

  test('search is case-insensitive', async ({ page }) => {
    await page.fill('input[placeholder="Search todos…"]', 'GROCERIES');
    await expect(page.locator('text=Buy groceries')).toBeVisible();
    await expect(page.locator('text=Meeting with team')).not.toBeVisible();
  });

  test('filters by completed status', async ({ page }) => {
    // Complete one todo
    await page.locator('input[type="checkbox"]').first().click();

    await page.locator('select:has-text("All")').last().selectOption('active');
    // Completed todo should be hidden
    const visibleCount = await page.locator('input[type="checkbox"]').count();
    const checkedCount = await page.locator('input[type="checkbox"]:checked').count();
    expect(checkedCount).toBe(0);

    await page.locator('select:has-text("active")').selectOption('completed');
    const completedCount = await page.locator('input[type="checkbox"]:checked').count();
    expect(completedCount).toBeGreaterThan(0);
  });

  test('clears search shows all todos', async ({ page }) => {
    await page.fill('input[placeholder="Search todos…"]', 'meeting');
    await expect(page.locator('text=Buy groceries')).not.toBeVisible();
    await page.fill('input[placeholder="Search todos…"]', '');
    await expect(page.locator('text=Buy groceries')).toBeVisible();
    await expect(page.locator('text=Meeting with team')).toBeVisible();
  });
});
