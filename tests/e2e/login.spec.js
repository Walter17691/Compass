import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('signs in and lands on Home with the org nav visible', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('button', { name: '+ New case' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Insights' })).toBeVisible();
});
