import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Scoped to case creation, not the full "run a meeting -> generate a
// letter" path from the plan: that path makes a real Claude API call with
// non-deterministic output, which makes it slow, costly, and flaky as an
// E2E assertion. The AI-generation logic itself isn't E2E-testable
// deterministically; what IS testable end-to-end is the structural path a
// user actually clicks through, which is what this covers.
test('creates a case and it appears in the case list', async ({ page }) => {
  const employeeName = `E2E Test ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);

  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.getByRole('combobox').nth(2).selectOption('misconduct'); // combobox 0 is the employee-name input (has a datalist), 1 is Location, 2 is Case type
  await page.getByPlaceholder('Brief summary of the issue…').fill('E2E test case — safe to delete.');
  await page.getByRole('button', { name: 'Create case', exact: true }).click();

  await expect(page.getByText(employeeName)).toBeVisible({ timeout: 10000 });
});
