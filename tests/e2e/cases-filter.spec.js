import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// CasesScreen had no filter controls at all before this — grouped-by-
// employee listing only. The shared E2E test org accumulates hundreds of
// cases across every spec run, and the employee list is paginated 15 at
// a time, so a freshly created case isn't reliably on the first page of
// the *unfiltered* list. A "from today" date filter alone isn't narrow
// enough either — a single day of this suite's own runs can create well
// over 15 cases — so both filters are applied together before the first
// assertion, never relying on the date filter alone to have already
// narrowed things down.
test('combining the type and date-opened filters on the Cases list narrows results correctly', async ({ page }) => {
  const employeeName = `E2E CasesFilter ${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('grievance');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '← Cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });

  // Narrow by date AND type together from the start.
  await page.getByLabel('From', { exact: true }).fill(today);
  await page.getByLabel('Filter by case type').selectOption('grievance');
  await expect(page.getByText(employeeName)).toBeVisible({ timeout: 10000 });

  // Same date range, wrong type — the grievance case should disappear.
  await page.getByLabel('Filter by case type').selectOption('misconduct');
  await expect(page.getByText(employeeName)).not.toBeVisible();

  // Switch back to the right type — it reappears.
  await page.getByLabel('Filter by case type').selectOption('grievance');
  await expect(page.getByText(employeeName)).toBeVisible();

  await page.getByRole('button', { name: /Clear filters/ }).click();
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('');
});
