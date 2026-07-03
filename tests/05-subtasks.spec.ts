import { test, expect } from '@playwright/test';

test.describe('Subtasks & Progress', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `sub-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('adds subtasks to a todo', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Prepare presentation');
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    // Expand subtasks
    await page.locator('button:has-text("Add subtasks")').first().click();

    // Add first subtask
    await page.fill('input[placeholder="Add subtask…"]', 'Create slides');
    await page.locator('button:has-text("Add")').last().click();
    await expect(page.locator('text=Create slides')).toBeVisible();

    // Add second subtask
    await page.fill('input[placeholder="Add subtask…"]', 'Rehearse speech');
    await page.locator('button:has-text("Add")').last().click();
    await expect(page.locator('text=Rehearse speech')).toBeVisible();
  });

  test('shows progress bar when subtasks exist', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Task with subs');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await page.locator('button:has-text("Add subtasks")').first().click();
    await page.fill('input[placeholder="Add subtask…"]', 'Sub 1');
    await page.locator('button:has-text("Add")').last().click();
    await page.fill('input[placeholder="Add subtask…"]', 'Sub 2');
    await page.locator('button:has-text("Add")').last().click();

    // Close subtask panel
    await page.locator('button:has-text("▲ Hide subtasks")').click();

    // Progress bar should show 0/2
    await expect(page.locator('text=0/2')).toBeVisible();
  });

  test('completing a subtask updates progress', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Progress test');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await page.locator('button:has-text("Add subtasks")').first().click();
    await page.fill('input[placeholder="Add subtask…"]', 'Step one');
    await page.locator('button:has-text("Add")').last().click();
    await page.fill('input[placeholder="Add subtask…"]', 'Step two');
    await page.locator('button:has-text("Add")').last().click();

    // Check first subtask
    await page.locator('input[type="checkbox"]').nth(1).click();

    // Progress should update
    await expect(page.locator('text=1/2')).toBeVisible();
  });

  test('deletes a subtask', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Delete subtask test');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await page.locator('button:has-text("Add subtasks")').first().click();
    await page.fill('input[placeholder="Add subtask…"]', 'To be deleted');
    await page.locator('button:has-text("Add")').last().click();
    await expect(page.locator('text=To be deleted')).toBeVisible();

    await page.locator('button:has-text("✕")').last().click();
    await expect(page.locator('text=To be deleted')).not.toBeVisible();
  });
});
