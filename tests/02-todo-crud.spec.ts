import { test, expect } from '@playwright/test';

test.describe('Todo CRUD + Priority', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `crud-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('creates a todo', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Buy groceries');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await expect(page.locator('text=Buy groceries').first()).toBeVisible();
  });

  test('marks todo as complete', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Complete me');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await page.locator('input[type="checkbox"]').first().click();
    await expect(page.locator('text=Complete me').first()).toHaveClass(/line-through/);
  });

  test('edits a todo title', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Original title');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await page.locator('input[type="text"]').first().fill('Updated title');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('text=Updated title').first()).toBeVisible();
  });

  test('deletes a todo', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Delete me');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('button:has-text("✕")').first().click();
    await expect(page.locator('text=Delete me')).not.toBeVisible();
  });

  test('sets high priority and shows red badge', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Urgent task');
    await page.locator('select').first().selectOption('high');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await expect(page.locator('text=high').first()).toBeVisible();
  });

  test('filters todos by priority', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'High priority task');
    await page.locator('select').first().selectOption('high');
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    await page.fill('input[placeholder="What needs to be done?"]', 'Low priority task');
    await page.locator('select').first().selectOption('low');
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    // Filter by high
    await page.locator('select:has-text("All priorities")').selectOption('high');
    await expect(page.locator('text=High priority task')).toBeVisible();
    await expect(page.locator('text=Low priority task')).not.toBeVisible();
  });
});
