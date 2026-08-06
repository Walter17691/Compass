import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Onboarding and offboarding share almost all of their UI and task-mutation
// logic (see src/screens/checklist/ChecklistScreen.jsx and
// src/lib/checklistTasks.js) — this covers both flows end-to-end so a
// change to the shared implementation can't silently break one of them
// while the other's tests stay green.
test('onboarding: create a starter, add a task, mutate it', async ({ page }) => {
  const starterName = `E2E Starter ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'HR Processes' }).click();
  await page.getByRole('menuitem', { name: 'Onboarding', exact: true }).click();
  await expect(page.getByText('New starter onboarding')).toBeVisible();

  await page.getByRole('button', { name: '+ Add starter' }).click();
  await page.getByPlaceholder('e.g. James Wilson').fill(starterName);
  await page.locator('input[type="date"]').fill('2026-09-01');
  await page.getByRole('button', { name: 'Create onboarding journey' }).click();
  await expect(page.getByText(starterName).first()).toBeVisible({ timeout: 10000 });

  await page.locator('input[placeholder="+ Add task..."]').first().fill('Custom onboarding task');
  await page.locator('input[placeholder="+ Add task..."]').first().press('Enter');
  await expect(page.getByText('Custom onboarding task')).toBeVisible();

  await page.getByRole('button', { name: '← All starters' }).click();
  await expect(page.getByText(starterName).first()).toBeVisible();
});

test('offboarding: create a leaver, see reason + exit interview, add a task', async ({ page }) => {
  const leaverName = `E2E Leaver ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'HR Processes' }).click();
  await page.getByRole('menuitem', { name: 'Offboarding', exact: true }).click();
  await expect(page.getByText('Employee offboarding')).toBeVisible();

  await page.getByRole('button', { name: '+ Add leaver' }).click();
  await page.getByPlaceholder('e.g. James Wilson').fill(leaverName);
  await page.locator('input[type="date"]').fill('2026-09-15');
  // Offboarding-only field — must survive sharing a component with onboarding.
  await expect(page.getByText('Reason for leaving')).toBeVisible();
  await page.getByRole('button', { name: 'Create offboarding checklist' }).click();
  await expect(page.getByText(leaverName).first()).toBeVisible({ timeout: 10000 });

  // Offboarding-only sidebar section.
  await expect(page.getByText('Exit interview', { exact: true })).toBeVisible();
  await page.locator('textarea[placeholder*="What did they say"]').fill('Left on good terms');

  await page.locator('input[placeholder="+ Add task..."]').first().fill('Custom offboarding task');
  await page.locator('input[placeholder="+ Add task..."]').first().press('Enter');
  await expect(page.getByText('Custom offboarding task')).toBeVisible();

  await page.getByRole('button', { name: '← All leavers' }).click();
  await expect(page.getByText(leaverName).first()).toBeVisible();
});
