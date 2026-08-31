import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

test('entering weekly pay shows an indicative exposure estimate with the disclaimer', async ({ page }) => {
  const employeeName = `E2E Risk ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  // UAT Product Hierarchy pass, Part 2, re-audited on human review —
  // Risk & tribunal exposure is now genuinely contextual (OverviewTab.jsx),
  // not unconditional. A fresh misconduct case at intake (no investigation
  // work done yet) no longer shows it by default — that's the intended
  // fix for the original UAT complaint, not a bug. Redundancy has no
  // disciplinary-hearing concept at all and is relevant from day one
  // regardless of stage, so it exercises the same weekly-pay/exposure
  // calculation this test actually cares about without fighting that
  // legitimate visibility rule.
  await page.getByRole('combobox').nth(2).selectOption('redundancy'); // combobox 0 is the employee-name input (has a datalist), 1 is Location, 2 is Case type
  await page.getByRole('button', { name: 'Create case', exact: true }).click();

  await page.getByText(employeeName).click();
  await expect(page.getByText('RISK & TRIBUNAL EXPOSURE')).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder('For exposure estimate').fill('500');
  await page.getByPlaceholder('For exposure estimate').blur();

  await expect(page.getByText('Indicative exposure:')).toBeVisible();
  await expect(page.getByText(/not legal advice/)).toBeVisible();
});
