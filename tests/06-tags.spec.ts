import { test, expect } from '@playwright/test';

test.describe('Tag System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `tag-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('creates a tag', async ({ page }) => {
    await page.getByRole('button', { name: /🏷 Tags/i }).click();
    await page.fill('input[placeholder="Tag name"]', 'work');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('text=work').first()).toBeVisible();
  });

  test('assigns a tag to a todo', async ({ page }) => {
    // Create tag
    await page.getByRole('button', { name: /🏷 Tags/i }).click();
    await page.fill('input[placeholder="Tag name"]', 'urgent');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.keyboard.press('Escape');

    // Create todo with tag
    await page.fill('input[placeholder="What needs to be done?"]', 'Tagged todo');
    await page.locator('button:has-text("urgent")').click();
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    await expect(page.locator('text=Tagged todo')).toBeVisible();
    await expect(page.locator('text=urgent').first()).toBeVisible();
  });

  test('filters todos by tag', async ({ page }) => {
    // Create tag
    await page.getByRole('button', { name: /🏷 Tags/i }).click();
    await page.fill('input[placeholder="Tag name"]', 'personal');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.keyboard.press('Escape');

    // Create tagged todo
    await page.fill('input[placeholder="What needs to be done?"]', 'Personal task');
    await page.locator('button:has-text("personal")').click();
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    // Create untagged todo
    await page.fill('input[placeholder="What needs to be done?"]', 'Untagged task');
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    // Filter by personal tag
    const tagFilter = page.locator('select:has-text("All tags")');
    await tagFilter.selectOption({ label: 'personal' });

    await expect(page.locator('text=Personal task')).toBeVisible();
    await expect(page.locator('text=Untagged task')).not.toBeVisible();
  });

  test('deletes a tag', async ({ page }) => {
    await page.getByRole('button', { name: /🏷 Tags/i }).click();
    await page.fill('input[placeholder="Tag name"]', 'to-delete');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('text=to-delete').first()).toBeVisible();

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.locator('text=to-delete')).not.toBeVisible();
  });
});
