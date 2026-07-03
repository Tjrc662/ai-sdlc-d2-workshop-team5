import { Page, expect } from '@playwright/test';

export class TodoHelper {
  constructor(private page: Page) {}

  async register(username: string) {
    await this.page.goto('/login');
    await this.page.getByRole('button', { name: 'Register' }).click();
    await this.page.fill('input[placeholder="Enter your username"]', username);
    await this.page.getByRole('button', { name: /Register with Passkey/i }).click();
    await expect(this.page).toHaveURL('/');
  }

  async login(username: string) {
    await this.page.goto('/login');
    await this.page.getByRole('button', { name: 'Login' }).click();
    await this.page.fill('input[placeholder="Enter your username"]', username);
    await this.page.getByRole('button', { name: /Login with Passkey/i }).click();
    await expect(this.page).toHaveURL('/');
  }

  async createTodo(title: string, options?: { priority?: string; dueDate?: string }) {
    await this.page.fill('input[placeholder="What needs to be done?"]', title);
    if (options?.priority) {
      await this.page.selectOption('select:near(input[placeholder="What needs to be done?"])', options.priority);
    }
    await this.page.getByRole('button', { name: '+ Add Todo' }).click();
    await expect(this.page.locator(`text=${title}`).first()).toBeVisible();
  }

  async addSubtask(todoTitle: string, subtaskTitle: string) {
    const todoEl = this.page.locator(`text=${todoTitle}`).first().locator('..').locator('..');
    await todoEl.getByText(/Add subtasks|subtask/i).click();
    await todoEl.fill('input[placeholder="Add subtask…"]', subtaskTitle);
    await todoEl.getByRole('button', { name: 'Add' }).click();
  }

  async createTag(name: string, color = '#3B82F6') {
    await this.page.getByRole('button', { name: /🏷 Tags/i }).click();
    await this.page.fill('input[placeholder="Tag name"]', name);
    await this.page.getByRole('button', { name: 'Add' }).click();
    await expect(this.page.locator(`text=${name}`).first()).toBeVisible();
    await this.page.keyboard.press('Escape');
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Logout' }).click();
    await expect(this.page).toHaveURL('/login');
  }
}
