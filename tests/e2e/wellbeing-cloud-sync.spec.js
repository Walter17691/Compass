import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Wellbeing notes previously lived only in localStorage (App.jsx used
// useState(ls("compass_wellbeing", [])) with no Supabase sync at all),
// despite the screen calling itself "confidential... restricted to HR
// only" — implying a shared org record the way cases/onboarding/offboarding
// are. A second HR user, or the same one on a different device, would see
// none of it. This proves the fix: clearing localStorage (simulating a
// different device/browser) must NOT lose the note — it now has to come
// back from wellbeing_notes in Supabase.
test('a wellbeing note survives clearing localStorage, proving it is cloud-synced not local-only', async ({ page }) => {
  const employeeName = `E2E Wellbeing ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'HR Processes' }).click();
  await page.getByRole('menuitem', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByText('Mental health & wellbeing')).toBeVisible();

  await page.getByRole('button', { name: '+ Add note' }).click();
  await page.getByPlaceholder('e.g. James Wilson').fill(employeeName);
  await page.getByPlaceholder(/What was discussed/).fill('E2E test wellbeing conversation notes.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('E2E test wellbeing conversation notes.')).toBeVisible({ timeout: 10000 });

  // Simulate a different device: wipe local storage entirely, then reload.
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: 'HR Processes' }).click();
  await page.getByRole('menuitem', { name: 'Wellbeing', exact: true }).click();
  await page.getByText(employeeName, { exact: true }).click();
  await expect(page.getByText('E2E test wellbeing conversation notes.')).toBeVisible({ timeout: 10000 });
});
