import { test, expect } from '@playwright/test';

test.describe('Template System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `tmpl-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('saves a todo as a template', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Weekly report');
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    // Click save as template
    await page.locator('button[title="Save as template"]').first().click();
    await page.fill('input[placeholder="Template name"]', 'Weekly Report Template');
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify template exists
    await page.getByRole('button', { name: /📋 Templates/i }).click();
    await expect(page.locator('text=Weekly Report Template')).toBeVisible();
  });

  test('uses a template to create a todo', async ({ page }) => {
    // Create and save template
    await page.fill('input[placeholder="What needs to be done?"]', 'Meeting prep');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await page.locator('button[title="Save as template"]').first().click();
    await page.fill('input[placeholder="Template name"]', 'Meeting Template');
    await page.getByRole('button', { name: 'Save' }).click();

    // Use template
    await page.getByRole('button', { name: /📋 Templates/i }).click();
    await page.getByRole('button', { name: 'Use' }).first().click();

    // New todo should appear
    await expect(page.locator('text=Meeting prep')).toHaveCount(2);
  });

  test('deletes a template', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Temp task');
    await page.getByRole('button', { name: '+ Add Todo' }).click();
    await page.locator('button[title="Save as template"]').first().click();
    await page.fill('input[placeholder="Template name"]', 'Temp Template');
    await page.getByRole('button', { name: 'Save' }).click();

    await page.getByRole('button', { name: /📋 Templates/i }).click();
    await page.locator('button:has-text("✕")').first().click();
    await expect(page.locator('text=Temp Template')).not.toBeVisible();
  });
});
