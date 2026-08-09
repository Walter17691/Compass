import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// CasesScreen had no filter controls at all before this — grouped-by-
// employee listing only. The shared E2E test org accumulates hundreds of
// cases across every spec run, and the employee list is paginated 15 at
// a time, so a freshly created case isn't reliably on the first page of
// the *unfiltered* list — asserting on that would be flaky regardless of
// what this test is actually checking. Scoping every assertion by
// today's date-opened filter keeps the candidate set small and the test
// meaningful: it proves type + date filters combine (AND), not just that
// one filter alone narrows results.
test('combining the type and date-opened filters on the Cases list narrows results correctly', async ({ page }) => {
  const employeeName = `E2E CasesFilter ${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('grievance');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '← Cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });

  // Narrow to today's cases only — small enough that our new case is
  // reliably on the first page.
  await page.getByLabel('From').fill(today);
  await expect(page.getByText(employeeName)).toBeVisible({ timeout: 10000 });

  // Same date range, wrong type — the grievance case should disappear.
  await page.locator('select').first().selectOption('misconduct');
  await expect(page.getByText(employeeName)).not.toBeVisible();

  // Switch back to the right type — it reappears.
  await page.locator('select').first().selectOption('grievance');
  await expect(page.getByText(employeeName)).toBeVisible();

  await page.getByRole('button', { name: /Clear filters/ }).click();
  await expect(page.getByLabel('From')).toHaveValue('');
});
