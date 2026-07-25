import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// This is the exact bug caught manually earlier this session: due_date
// was coming out one day short because of a UTC/local timezone mismatch
// in how the date was serialized before storage (src/lib/dates.js,
// toISODateLocal). A fixed, far-past received date keeps this assertion
// deterministic regardless of what day the test actually runs on.
test('DSAR due date is exactly receivedDate + 1 calendar month', async ({ page }) => {
  const employeeName = `E2E DSAR ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'DSAR', exact: true }).click();
  await page.getByRole('button', { name: '+ Log new request' }).click();

  await page.getByPlaceholder('e.g. Ada Lovelace').fill(employeeName);
  await page.locator('input[type="date"]').fill('2020-01-15');
  await page.getByRole('button', { name: 'Log request' }).click();

  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Due 2020-02-15').first()).toBeVisible();
});
