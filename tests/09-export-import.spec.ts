import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Export & Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.fill('input[placeholder="Enter your username"]', `export-user-${Date.now()}`);
    await page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('exports todos as JSON file', async ({ page }) => {
    await page.fill('input[placeholder="What needs to be done?"]', 'Export test todo');
    await page.getByRole('button', { name: '+ Add Todo' }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Export' }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('todos-export.json');
  });

  test('imports todos from JSON file', async ({ page }) => {
    // Create a JSON export file
    const importData = {
      todos: [
        {
          title: 'Imported todo',
          priority: 'high',
          completed: 0,
          due_date: null,
          recurrence_pattern: null,
          reminder_minutes: null,
          tags: [],
          subtasks: [{ title: 'Imported subtask', position: 0 }],
        },
      ],
      tags: [],
    };

    const tmpFile = path.join(os.tmpdir(), `import-test-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(importData));

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    page.on('dialog', (dialog) => dialog.accept());
    await expect(page.locator('text=Imported todo')).toBeVisible({ timeout: 5000 });

    fs.unlinkSync(tmpFile);
  });
});
